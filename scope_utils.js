// TODO: - abstract over console errors/warnings?

(function(require,exports){

// var util     = require("util");

var parse    = require("./esprima.js").parse; // TODO: use node_modules/ ?

var ast_utils        = require("./ast_utils.js");
var traverse         = ast_utils.traverse;
var traverseWithKeys = ast_utils.traverseWithKeys;

ast_utils.registerAnnotations(['decls'
                              ,'occurrences'
                              ,'freeVars'
                              ,'innerScopes'
                              ,'hoistConflict'
                              ]);

// rename variable oldName at loc (line/column) to newName
//
// 0 check oldName/newName are valid
// 1 find var with oldName at loc (error if unfound)
// 2 find binding_scope for var (error if unfound)
// 3 find oldName occurrences bound to binding_scope (at least one)
// 4 find newName occurrences relatively free in binding_scope
// 5 find newName binders between binding_scope and bound oldName occurrences
// 6 check that newName at binding scope does not conflict with existing binder there
//    (TODO: what about different levels - function id vs params vs fundecls vs vars?)
// 7 check that newName at binding scope does not capture existing vars (4)
// 8 check that occurrences of newName are not captured by existing binders (3,5)
// 9 return copy of source, replacing bound occurrences of oldName (3) with newName
//    (to achieve faithful reproduction of untransformed source, use range info
//     to replace names while copying source)
//
// + check that renaming does not touch same-name hoisting over catch
// + do not rename variables where the declaration is not visible (globals)
// + check that renaming does not introduce same-name hoisting over catch (8)
//
// TODO: for multiple declarations, we choose the first as the binding occurrence
//
//
function rename(oldName,location,newName) { return function(sourcefile,source) {

  if (!checkName(oldName) || !checkName(newName))
    return;

  try {
    var sourceAST = parse(source,{loc:true,range:true});
  } catch (e) {
    console.error("parse error in "+sourcefile,e);
    return;
  }

  // augment AST with scope-related info, and find
  // binding_scope for oldName occurrence at location
  var binding_scope = find(oldName,location,sourceAST);

  var oldNameBinding,newNameBinding;
  var innerScopeCaptures = [];
  var hoistConflict;
  var newSource;

  if (binding_scope) {

    // console.log( util.inspect(binding_scope,false,7) );
    binding_scope.decls.forEach(function(d){
      if (d[0].name===oldName && !oldNameBinding) oldNameBinding = d;
      if (d[0].name===newName && !newNameBinding) newNameBinding = d;
    });

    if (newNameBinding) {
      console.error('renamed binding for '+oldName+' would conflict');
      console.error('with existing binding for '+newName+' in the same scope');
      console.error(newNameBinding[0].loc.start,newNameBinding[1]);
      // console.error(util.inspect(newNameBinding,false,5));
      return;
    }

    if (binding_scope.freeVars.some(function(fv){ return (fv.name===newName) })) {
      console.error('renamed binding for '+oldName+' would capture');
      console.error('existing occurrences of '+newName);
      binding_scope.freeVars.forEach(function(fv){
        if (fv.name===newName)
          console.error(fv.loc.start);
      });
      // console.error(util.inspect(binding_scope.freeVars
      //                           .filter(function(fv){ return (fv.name===newName) }),false,5));
      return;
    }

    if (oldNameBinding) {

      // console.log( util.inspect(oldNameBinding,false,9) );
      oldNameBinding[0].occurrences.concat([oldNameBinding[0]])
        .forEach(function(v){ // TODO: avoid repetition
          v.innerScopes.forEach(function(s){
            s.decls.forEach(function(d){
              if (d[0].name===newName)
                innerScopeCaptures.push([v.name,v.loc,d]);
            });
          });
          if (v.hoistConflict) hoistConflict = v;
        });
      if (oldNameBinding[0].hoistConflict) hoistConflict = oldNameBinding[0];

      if (innerScopeCaptures.length>0) {
        console.error('renamed occurrences of '+oldName+' would be captured');
        console.error('by existing bindings for '+newName);
        innerScopeCaptures.forEach(function(isc){
          console.error(isc[0],isc[1].start,'by'
                       ,isc[2][0].name,isc[2][0].loc.start,isc[2][1]);
        });
        // console.error(util.inspect(innerScopeCaptures,false,5));
        return;
      }

      if (hoistConflict) {
        console.error('cannot rename declaration hoisted over catch');
        console.error(hoistConflict);
        return;
      }

      newSource = replace(oldNameBinding[0],newName,source);
      return {source: newSource};

    } else

      console.error("binding not found in binding scope???");

  } else

    console.error("no binding scope found");

} }

// is name a valid variable name?
// (would be nicer to call Identifier-nonterminal parser directly,
//  to avoid irrelevant parse errors, but that isn't exported)
function checkName(name) {
  try {

    if (name==='arguments')
      throw 'not permitted';

    var nameAST = parse(name);
    // console.log(util.inspect(nameAST,false,4));

    var nameOK = (nameAST.type==='Program')
               &&(nameAST.body.length===1)
               &&(nameAST.body[0].type==='ExpressionStatement')
               &&(nameAST.body[0].expression.type==='Identifier')
               &&(nameAST.body[0].expression.name===name);
    if (!nameOK)
      throw 'not valid';
    return nameOK;

  } catch (e) {
    console.error('not a valid variable name >'+name+'<');
    // parsing an invalid Identifier as a Program leads to irrelevant
    // parse errors..
    // console.error('parse error in variable name >'+name+'<',e);
    return false;
  }
}

// return copy of source text, replacing variable occurrences with newName
// TODO: generalize, move to source_utils
function replace(variable,newName,source) {
  var newSource   = "";
  var index       = 0;
  var occurrences = insert(variable,variable.occurrences);

  for (var i=0; i<occurrences.length; i++) {
    var occurrence = occurrences[i];
    newSource += source.slice(index,occurrence.range[0]);
    newSource += newName;
    index = occurrence.range[0]+variable.name.length;
  }
  newSource += source.slice(index);

  return newSource;
}

// insert binding occurrence in other occurrences, in source order
function insert(binding,others) {
  var position = 0;
  others.forEach(function(occ,i){
    if (binding.range[0]>occ.range[0])
      position = i+1;
  });
  return others.slice(0,position).concat([binding],others.slice(position));
}

function collect(sourcefile,source) {

  try {
    var result = parse(source,{loc:true,range:true});
  } catch (e) {
    console.error("parse error in "+sourcefile,e);
    return;
  }

  var decls = collectDecls(result);
  // console.log(util.inspect(decls,false,4));
  return decls;

}

function findVar(name,location) { return function(sourcefile,source) {

  try {
    var result = parse(source,{loc:true,range:true});
  } catch (e) {
    console.error("parse error in "+sourcefile,e);
    return;
  }

  var binding_scope = find(name,location,result);
  var nameBinding;

  if (binding_scope) {

    // console.log( util.inspect(binding_scope,false,5) );

    /*
    console.log('binding scope: ');
    console.log(binding_scope.type,binding_scope.loc);
    */
    binding_scope.decls.forEach(function(d){
      if (d[0].name===name && !nameBinding) nameBinding = d;
    });

    if (nameBinding) {

      if (nameBinding[0].hoistConflict
        ||nameBinding[0].occurrences.some(function(o){return o.hoistConflict})) {

        console.warn('WARNING! Information affected by hoisting over catch.');
      }

      /*
      console.log('binding occurrence: ');
      console.log(nameBinding[1],nameBinding[0].loc.start);
      console.log('other occurrences: ');
      console.log(nameBinding[0].occurrences.map(function(o){
                                                  return [o.name,o.loc.start]
                                                 }));
      */

      return {scope:binding_scope
             ,binding:nameBinding
             };

    } else

      console.error("binding not found in binding scope???");


  } else

    console.error("no binding scope found");
} }

// find binding_scope for variable name at location, within node
//
// augments node AST:
// - functions gain .decl field, recording their declarations,
//    and .freeVars field, recording (relatively) free id occurrences
// - binding occurrences of ids gain .occurrences field, recording
//    their non-binding id occurrences
// - occurrences of ids gain .innerScopes field, recording scopes
//    between them and their binding_scope
//
// TODO: should we make the annotations non-enumerable?
//
// TODO: circular reference possible via innerScopes
//
// TODO: try to split it into general (reusable) scope-annotater and 
//       renaming-specific info-gathering for capture-avoidance checks?
//
function find(name,location,node) {
  var scopes = [], binding_scope = null;

  function findAction(parent) { return function(key,node,children) {
    var decls     = [];
    var scopebase = scopes.length;

    // console.log( 'parent', parent );
    // console.log( key+'='+node.type+(node.type==='Identifier'?'('+node.name+')':''), node.loc );
    // console.log( '>'+scopes.length
    //           , util.inspect(scopes.map(function(s){return [s.type,s.loc]}),false,5) );

    switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':

      node.params.forEach(function(p){
        decls.push([p,node.type+' Parameter']);
      });

      if (node.type==='FunctionExpression' && node.id) {
        decls.push([node.id,node.type]);
      }

      decls = decls.concat(collectDecls(node.body));

      decls.forEach(function(d){d[0].occurrences = []}); // augmenting AST
      node.freeVars = []; // augmenting AST
      node.decls = decls; // augmenting AST

      scopes.push(node);
      break;

    case 'Program':

      decls = decls.concat(collectDecls(node.body));

      decls.forEach(function(d){d[0].occurrences = []}); // augmenting AST
      node.freeVars = []; // augmenting AST
      node.decls = decls; // augmenting AST

      scopes.push(node);
      break;

    case 'CatchClause':

      decls = [[node.param,node.type+' Parameter']];

      node.param.occurrences = []; // augmenting AST
      node.freeVars = []; // augmenting AST
      node.decls = decls; // augmenting AST

      scopes.push(node);
      break;

    case 'Identifier':

      // console.log('variable occurrence found ',node);
      // console.log(util.inspect(scopes,false,5));
      if (!node.innerScopes)
        node.innerScopes = [];          // augmenting AST

      // traverse scope chain upwards, to find binders;
      // record bound and (relatively) free variable occurrences 
      // for each binder, and record the binding_scope for name
      // TODO: cleanup
      for (var i=scopes.length-1; i>=0; i--) {
        if (scopes[i].decls.some(function(d){
                                   if (d[0].name===node.name) {
                                     if (d[0]!==node)
                                       d[0].occurrences.push(node); // augmenting AST
                                     return true;
                                   } else
                                     return false;
                                 })) {
          if (node.name===name
            && node.loc.start.line===location.line
            && node.loc.start.column<=location.column
            && node.loc.end.column>=location.column) {

            binding_scope = scopes[i];
            // console.log('binding scope found ',binding_scope);
            // console.log(binding_scope.loc);

          }
          break;

        } else {

          scopes[i].freeVars.push(node); // augmenting AST
          // if (node.name===name)
          node.innerScopes.push(scopes[i]); // augmenting AST

        }
      }

    } 

    // traverse AST node children;
    //
    // Identifier is overused in the AST, so we filter out unsuitable parents:
    //        - object property selectors (non-computed)
    //        - object property keys
    //        - labels
    //
    // TODO: each of these might want their own renaming, but the
    //        scope rules differ
    //
    switch (node.type) {

      case 'Property':

        // skip property keys
        traverseWithKeys(findAction(node))(['value',node.value]);
        break;

      case 'ContinueStatement':
      case 'BreakStatement':

        // skip label
        break;

      case 'LabeledStatement':

        // skip label
        traverseWithKeys(findAction(node))(['body',node.body]);
        break;

      case 'MemberExpression':
      
        if (!node.computed) {
          // skip non-computed property selectors
          traverseWithKeys(findAction(node))(['object',node.object]);
          break;
        }

      default:

        // traverse all children
        children.forEach(traverseWithKeys(findAction(node)));
    }


    if (scopes.length>scopebase) scopes.pop();
    
  } }

  traverseWithKeys(findAction(null))(['root',node]);

  return binding_scope;
}

// TODO: - do we need to collect funs and vars separately (10.5)?
//          => just insert funs before vars, if needed?
function collectDecls(node) {
  var decls = [], catches = [];

  function collectDeclsAction(node,children) {

      if (node.type==='FunctionDeclaration') {

        if (catches.indexOf(node.id.name)>-1) {
          node.id.hoistConflict = true;
          console.warn('WARNING! hoisting function declaration over catch of same name: ',node.id.name);
          console.warn(node.loc);
        }
        decls.push([node.id,node.type]);
        return;

      } else if (node.type==='FunctionExpression') {

        return;

      } else if (node.type==='VariableDeclarator') {

        if (catches.indexOf(node.id.name)>-1) {
          node.id.hoistConflict = true;
          console.warn('WARNING! hoisting var declaration over catch of same name: ',node.id.name);
          console.warn(node.loc);
        }
        decls.push([node.id,node.type]);

      } else if (node.type==='CatchClause') {

        catches.push(node.param.name);

      }

      children.forEach(traverse(collectDeclsAction));

      if (node.type==='CatchClause') {

        catches.pop();

      }

  }

  traverse(collectDeclsAction)(node);
  return decls;

}

exports.collect = collect; 

exports.findVar = findVar;

exports.rename  = rename;

}(typeof require==='function'
   ? require
   : function(dependency) { return require.cache[dependency] }
 ,typeof exports==='object'
   ? exports
   : (require.cache?require.cache:require.cache={})['./scope_utils.js'] = {}
 ));

