
// TODO: do we need to sort AST children in source order?
//       if yes, it might be good to keep index of sorted keys
//

// mask out AST node fields that hold annotations, not child nodes;
// standard annotations
var annotation = { range:       true
                 , loc:         true
                 };

// allow clients to add non-standard annotations
function registerAnnotations(annotations) {
  annotations.forEach(function(ann){ annotation[ann] = true });
}

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

exports.registerAnnotations = registerAnnotations;
exports.traverse            = traverse;
exports.traverseWithKeys    = traverseWithKeys;
