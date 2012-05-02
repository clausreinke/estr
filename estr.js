/*
 * estr (Ecmascript traversals)
 *
 * Claus Reinke
 */

"use strict";

var fs    = require("fs");
var util  = require("util");
var parse = require("./esprima.js").parse;

var tags = [];

// CLI, select task to perform
switch (process.argv[2]) {
  case "tags":
    processFilenames(process.argv.slice(3));
    writeTags("tags"); // TODO: optional JSON output?
    break;
}

// recurse into directories, process .js files, ignore others
// (no protection against cycles)
function processFilenames(paths) {
  var stat;
  paths.forEach(function(path) {
    stat = fs.statSync(path);
    if (stat.isFile() && path.match(/\.js$/))
      generateTags(path);
    else if (stat.isDirectory())
      processFilenames(fs.readdirSync(path).map(function(p){return path+'/'+p}));
    else
      console.error("ignoring "+path);
  }); 
}

// building block for traversing an object-tree;
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
            if (typeof child === 'object' && child !== null) {
                children.push(child);
            }
        }
    }
    action(object,children);
} }

// parse JS file, extract tags by traversing AST while tracking scopes
function generateTags(sourcefile) {

  var source = fs.readFileSync(sourcefile,'utf8');

    try {
      var result = parse(source,{loc:true});
    } catch (e) {
      console.error("parse error in "+sourcefile,e);
      return;
    }

    var scopes = [];  // stack of function body scopes

    function extractTags(node,children){
        var scope;

        // TODO: various module systems
        //       not to mention various class/mixin systems or ember's 
        //         lifted object system..
        //       var f = function(){}
        //       { f : function(){} }

        // NOTE: location info is start of parsed text to start of unparsed text;
        //          also, lines are 1-based, columns are 0-based;
        //          for 1-based line/colums, we need to adjust start columns

        if ((node.type==='FunctionDeclaration')
          ||(node.type==='FunctionExpression')) {

          scopes.push(node.loc.start.line+":"+(node.loc.start.column+1)+"-"
                     +node.loc.end.line+":"+node.loc.end.column);

          scope = scopes.length>1 ? scopes[scopes.length-2] : "global";

          if (node.type==='FunctionDeclaration')

            tags.push({name: node.id.name
                      ,file: sourcefile
                      ,addr: node.id.loc.start.line
                      ,kind: "f"
                      ,lineno: node.id.loc.start.line
                      ,scope: scope
                      });

          else if (node.id)

            tags.push({name: node.id.name
                      ,file: sourcefile
                      ,addr: node.id.loc.start.line
                      ,kind: "fe"
                      ,lineno: node.id.loc.start.line
                      ,scope: node.loc.start.line+":"+(node.loc.start.column+1)+"-"
                             +node.loc.end.line+":"+node.loc.end.column
                      });

          var paramScope = node.loc.start.line+":"+(node.loc.start.column+1)+"-"
                          +node.loc.end.line+":"+node.loc.end.column;

          node.params.forEach(function(param){
            tags.push({name: param.name
                      ,file: sourcefile
                      ,addr: param.loc.start.line
                      ,kind: "vp"
                      ,lineno: param.loc.start.line
                      ,scope: paramScope
                      });
          });

        } else if (node.type==='VariableDeclarator') {

          scope = scopes.length>0 ? scopes[scopes.length-1] : "global";

          tags.push({name: node.id.name
                    ,file: sourcefile
                    ,addr: node.id.loc.start.line
                    ,kind: "v"
                    ,lineno: node.id.loc.start.line
                    ,scope: scope
                    });

        } else if (node.type==='CatchClause') {

          tags.push({name: node.param.name
                    ,file: sourcefile
                    ,addr: node.param.loc.start.line
                    ,kind: "ve"
                    ,lineno: node.param.loc.start.line
                    ,scope: node.body.loc.start.line+":"+(node.body.loc.start.column+1)+"-"
                           +node.body.loc.end.line+":"+node.body.loc.end.column
                    });

        }

        children.forEach(traverse(extractTags));

        if ((node.type==='FunctionDeclaration')
          ||(node.type==='FunctionExpression')) {

          scopes.pop();

        }
      }

    traverse(extractTags)(result);
}

// write tags to file, in (sorted) tags-file format
function writeTags(file) {

  // TODO: sort by further fields, too
  tags.sort(function(x,y){ return x.name.localeCompare(y.name) });

  var tagFile = [];

  tagFile.push('!_TAG_FILE_SORTED\t1\t');
  tagFile.push('!_TAG_PROGRAM_AUTHOR\tClaus Reinke\t');
  tagFile.push('!_TAG_PROGRAM_NAME\testr\t');
  tagFile.push('!_TAG_PROGRAM_URL\thttps://github.com/clausreinke/estr\t');
  tagFile.push('!_TAG_PROGRAM_VERSION\t0.0\t');

  tags.forEach(function(tag){
    tagFile.push(tag.name+"\t"+tag.file+"\t"+tag.addr+";\"\t"+tag.kind
               +"\tlineno:"+tag.lineno+"\tscope:"+tag.scope);
  });

  fs.writeFileSync(file,tagFile.join('\n'));
}
