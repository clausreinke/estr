
// TODO: - do we need to sort AST children in source order?
//          if yes, it might be good to keep index of sorted keys
//       - replace property key blacklist with child key whitelist

(function(require,exports){

var esprima = require("./esprima.js");

// mask out AST node fields that hold annotations, not child nodes;
// standard annotations
var annotation = { range:       true
                 , loc:         true
                 };

// allow clients to add non-standard annotations
function registerAnnotations(annotations) {
  annotations.forEach(function(ann){ annotation[ann] = true });
}

// wrap action to add parsing; pass AST or return parse error
function parseThen(action) { return function(sourcefile,source) {

  try {
    var sourceAST = esprima.parse(source,{loc:true,range:true});
  } catch (e) {
    return {parseError:e,sourcefile:sourcefile};
  }

  return action(sourcefile,source,sourceAST);

}}

// building block for traversing an object-tree;
// traverse handles AST-specific (one-level) child enumeration,
// action has full control of recursion and traversal order:
//
// function action(node,children){
//   pre(node);
//   if (condition) children.forEach(traverse(action));
//   post(node);
// }
// traverse(action)(ast);
//
function traverse(action) { return function(object) {
    var key, child, children = [];

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && !annotation[key]) {
                children.push(child);
            }
        }
    }
    action(object,children);
} }

// as traverse, but provide access to parent keys
function traverseWithKeys(action) { return function(parentKey_obj) {
    var key, child, children = [];
    var parentKey = parentKey_obj[0];
    var object    = parentKey_obj[1];

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && !annotation[key]) {
                children.push([key,child]);
            }
        }
    }
    action(parentKey,object,children);
} }

// find ast node from location
// (tightest location span including location)
function findNode(location,node) {
  var target;

  function findAction(node,children) {

    if (node.loc
     && node.loc.start.line<=location.line
     && node.loc.end.line>=location.line
     && node.loc.start.column<=location.column
     && node.loc.end.column>=location.column) {

     if (!target
      || (node.loc.start.line>=target.loc.start.line
       || node.loc.end.line<=target.loc.end.line
       || node.loc.start.column>=target.loc.start.column
       || node.loc.end.column<=target.loc.end.column
         )) {

       target = node;

     }

    }

    children.forEach(traverse(findAction));
  }

  traverse(findAction)(node);

  return target;
}

exports.registerAnnotations = registerAnnotations;
exports.parseThen           = parseThen;
exports.traverse            = traverse;
exports.traverseWithKeys    = traverseWithKeys;
exports.findNode            = findNode;

}(typeof require==='function'
   ? require
   : function(dependency) { return require.cache[dependency] }
 ,typeof exports==='object'
   ? exports
   : (require.cache?require.cache:require.cache={})['./ast_utils.js'] = {}
 ));

