
(function(require,exports){

var parse    = require("./esprima.js").parse; // TODO: use node_modules/ ?

var ast_utils        = require("./ast_utils.js");
var traverse         = ast_utils.traverse;
var traverseWithKeys = ast_utils.traverseWithKeys;

ast_utils.registerAnnotations(['decls'
                              ,'occurrences'
                              ,'freeVars'
                              ,'innerScopes'
                              ,'binding_decl'
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
/**
 * rename variable oldName at location to newName, working with
 * source (from sourcefile) and sourceAST (from source);
 * if successful, returns modified source;
 * NOTE: sourceAST is augmented with binding information, in place!
 *
 * @param oldName     String
 * @param location    {line: Number, column: Number}
 * @param newName     String
 *
 * @param sourcefile  String
 * @param source      String
 * @param sourceAST   AST
 *
 * @returns {source:String,warnings:String}
 *       or {error:{message:String,type:String},warnings:String}
 */
function rename(oldName,location,newName) {
  return function(sourcefile,source,sourceAST) {

  try {
    checkName(oldName); // TODO: move out?
    checkName(newName); // TODO: move out?
  } catch (e) {
    return {error: {message:e,type:'InvalidName'}};
  }

  // augment AST with scope-related info, and find
  // binding_scope for oldName occurrence at location
  var found         = find(oldName,location,sourceAST);
  var binding_scope = found.binding_scope;
  var warnings      = found.warnings;

  var oldNameBinding,newNameBinding;
  var innerScopeCaptures = [];
  var hoistConflict;
  var newSource;

  if (binding_scope) {

    binding_scope.decls.forEach(function(d){
      if (d[0].name===oldName && !oldNameBinding) oldNameBinding = d;
      if (d[0].name===newName && !newNameBinding) newNameBinding = d;
    });

    if (newNameBinding) {
      return add({error:
        {message:'renamed binding for '+oldName+' would conflict\n'
                +'with existing binding for '+newName+' in the same scope\n'
                +show_loc_point(newNameBinding[0].loc.start)+' '
                +"'"+newNameBinding[1]+"'"
        ,type: 'RenamedBindingConflict'
        }},'warnings',warnings);
    }

    if (binding_scope.freeVars.some(function(fv){ return (fv.name===newName) })) {
      return add({error:
        {message:'renamed binding for '+oldName+' would capture\n'
                +'existing occurrences of '+newName+'\n'
                +binding_scope.freeVars.filter(function(fv){
                   return (fv.name===newName)
                 }).map(function(fv) {
                   return show_loc_point(fv.loc.start)
                 }).join('\n')
        ,type: 'CaptureExisting'
        }},'warnings',warnings);
    }

    if (oldNameBinding) {

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
        return add({error:
          {message:'renamed occurrences of '+oldName+' would be captured\n'
                  +'by existing bindings for '+newName+'\n'
                  +innerScopeCaptures.map(function(isc){
                    return isc[0]+' '
                          +show_loc_point(isc[1].start)+' '
                          +'by '
                          +isc[2][0].name+' '
                          +show_loc_point(isc[2][0].loc.start)+' '
                          +isc[2][1];
                   }).join('\n')
          ,type: 'CaptureRenamed'
          }},'warnings',warnings);
      }

      if (hoistConflict) {
        return add({error:
          {message:'cannot rename declaration hoisted over catch\n'
                  +hoistConflict.name+' '+show_loc_point(hoistConflict.loc.start)
          ,type: 'HoistConflict'
          }},'warnings',warnings);
      }

      newSource = replace(oldNameBinding[0],newName,source);
      return add({source: newSource},'warnings',warnings);

    } else

      return add({error:
        {message:'binding not found in binding scope???'
        ,type: 'MissingBinding'
        }},'warnings',warnings);

  } else

    return add({error:
      {message:'no binding scope found'
      ,type: 'MissingBinding'
      }},'warnings',warnings);

} }

function add(obj,key,value) { if (value) obj[key] = value; return obj }

// is name a valid variable name?
// (would be nicer to call Identifier-nonterminal parser directly,
//  to avoid irrelevant parse errors, but that isn't exported)
function checkName(name) {
  try {

    if (name==='arguments')
      throw 'not permitted';

    var nameAST = parse(name);

    var nameOK = (nameAST.type==='Program')
               &&(nameAST.body.length===1)
               &&(nameAST.body[0].type==='ExpressionStatement')
               &&(nameAST.body[0].expression.type==='Identifier')
               &&(nameAST.body[0].expression.name===name);
    if (!nameOK)
      throw 'not valid';

  } catch (e) {
    throw ('not a valid variable name >'+name+'<');
    // parsing an invalid Identifier as a Program leads to irrelevant
    // parse errors..
    // console.error('parse error in variable name >'+name+'<',e);
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

function collect(sourcefile,source,sourceAST) {

  return collectDecls(sourceAST);

}

/**
 * find variable name at location, working with source
 * (from sourcefile) and sourceAST (from source);
 * if successful, returns binding occurrence and scope;
 * NOTE: sourceAST is augmented with binding information, in place!
 *
 * @param name        String
 * @param location    {line: Number, column: Number}
 *
 * @param sourcefile  String
 * @param source      String
 * @param sourceAST   AST
 *
 * @returns {scope:AST,binding:[AST,String],warnings:String}
 *       or {error:{message:String,type:String},warnings:String}
 */
function findVar(name,location) {
  return function(sourcefile,source,sourceAST) {

  var nameBinding;

  var result = {};

  var found         = find(name,location,sourceAST);
  var binding_scope = found.binding_scope;
  if (found.warnings) {
    result.warnings = found.warnings;
  }

  if (binding_scope) {

    binding_scope.decls.forEach(function(d){
      if (d[0].name===name && !nameBinding) nameBinding = d;
    });

    if (nameBinding) {

      if (nameBinding[0].hoistConflict
        ||nameBinding[0].occurrences.some(function(o){return o.hoistConflict})) {

        result.scope   = binding_scope;
        result.binding = nameBinding;
        result.warnings = (result.warnings ? result.warnings+'\n' : '')
                         +'WARNING! Information affected by hoisting over catch.'

      } else {

        result.scope   = binding_scope;
        result.binding = nameBinding;

      }

    } else

      result.error = {message:'binding not found in binding scope???'
                     ,type: 'MissingBinding'
                     };


  } else {

    result.error = {message:'no binding scope found'
                   ,type: 'MissingBinding'
                   };

  }
  return result;
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
  var warnings = [];

  function findAction(parent) { return function(key,node,children) {
    var decls     = [];
    var sub_decls;
    var scopebase = scopes.length;

    switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':

      node.params.forEach(function(p){
        decls.push([p,node.type+' Parameter']);
      });

      if (node.type==='FunctionExpression' && node.id) {
        decls.push([node.id,node.type]);
      }

      sub_decls = collectDecls(node.body);
      if (sub_decls.warnings) warnings.push(sub_decls.warnings);
      decls = decls.concat(sub_decls.decls);

      decls.forEach(function(d){d[0].occurrences = []}); // augmenting AST
      node.freeVars = []; // augmenting AST
      node.decls = decls; // augmenting AST

      scopes.push(node);
      break;

    case 'Program':

      sub_decls = collectDecls(node.body);
      if (sub_decls.warnings) warnings.push(sub_decls.warnings);
      decls = decls.concat(sub_decls.decls);

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
                                     node.binding_decl = d[0]; // augmenting AST
                                     return true;
                                   } else
                                     return false;
                                 })) {
          if (node.name===name
            && node.loc.start.line===location.line
            && node.loc.start.column<=location.column
            && node.loc.end.column>=location.column) {

            binding_scope = scopes[i];

          }
          break;

        } else {

          scopes[i].freeVars.push(node); // augmenting AST
          // if (node.name===name)
          node.innerScopes.push(scopes[i]); // augmenting AST

        }
      }
      // TODO: bind unbound variables as implicit globals?

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

  if (warnings.length>0) {
    return {binding_scope:binding_scope,warnings:warnings.join('\n')};
  } else {
    return {binding_scope:binding_scope};
  }
}

// TODO: - do we need to collect funs and vars separately (10.5)?
//          => just insert funs before vars, if needed?
function collectDecls(node) {
  var decls = [], catches = [], warnings = [];

  function collectDeclsAction(node,children) {

      if (node.type==='FunctionDeclaration') {

        if (catches.indexOf(node.id.name)>-1) {
          node.id.hoistConflict = true;
          warnings.push('WARNING! hoisting function declaration over catch of same name: '+node.id.name);
          warnings.push(show_loc(node.loc));
        }
        decls.push([node.id,node.type]);
        return;

      } else if (node.type==='FunctionExpression') {

        return;

      } else if (node.type==='VariableDeclarator') {

        if (catches.indexOf(node.id.name)>-1) {
          node.id.hoistConflict = true;
          warnings.push('WARNING! hoisting var declaration over catch of same name: '+node.id.name);
          warnings.push(show_loc(node.loc));
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
  if (warnings.length>0) {
    return {decls:decls,warnings:warnings.join('\n')};
  } else {
    return {decls:decls};
  }

}

function show_loc_point(point) {
  return "{ line: "+point.line+", column: "+point.column+" }"
}

function show_loc(loc) {
  return "{ start: "+show_loc_point(loc.start)+",\n"
        +"  end: "+show_loc_point(loc.end)+" }"
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

