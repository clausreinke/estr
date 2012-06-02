/*
 * estr (Ecmascript traversals)
 *
 * https://github.com/clausreinke/estr
 *
 * Claus Reinke
 */

"use strict";

var fs          = require("fs");
var tags        = require("./tags.js");
var scope_utils = require("./scope_utils.js");

// CLI, select task to perform
switch (process.argv[2]) {

  case "help":
    console.log('estr (Ecmascript traversals)');
    console.log();
    console.log('estr tags ..paths');
    console.log('   traverse paths, extract tags from .js-files, write to file "tags"');
    console.log();
    console.log('estr rename file.js oldName <line> <column> newName');
    console.log('   parse file.js, rename oldName (at <line> <column>) to newName');
    break;

  case "tags":  // ..paths
    // fairly stable, useable
    processJSfiles(process.argv.slice(3),tags.generateTags);
    fs.writeFileSync("tags",tags.tagFile().join('\n')); // TODO: OS-dep line end?
    break;

  case "collectDecls":  // ..paths
    // experimental, temporary
    (function(){
      var results = processJSfiles(process.argv.slice(3),scope_utils.collect);
      if (results[0]) {
        // console.log(util.inspect(results[0],false,4));
        results[0].forEach(function(decl){
          console.log(decl[0].name,decl[0].loc.start,decl[1]);
        });
      }
    }());
    break;

  case "findVar": // file varName line column
    // experimental, temporary
    (function(){
      var results = processJSfiles([process.argv[3]]
                                  ,scope_utils.findVar(process.argv[4]
                                                      ,{line:   +process.argv[5]
                                                       ,column: +process.argv[6]}));
      if (results[0]) {
        var scope   = results[0].scope;
        var binding = results[0].binding;

        console.log('binding scope: ');
        console.log(scope.type,scope.loc);

        console.log('binding occurrence: ');
        console.log(binding[1],binding[0].loc.start);
        console.log('other occurrences: ');
        console.log(binding[0].occurrences.map(function(o){
                                                return [o.name,o.loc.start]
                                               }));

      }
    }());
    break;

  case "rename": // file oldName line column newName
    // experimental, work in progress
    (function(){
      var results = processJSfiles([process.argv[3]]
                                  ,scope_utils.rename(process.argv[4]
                                                     ,{line:   +process.argv[5]
                                                      ,column: +process.argv[6]}
                                                     ,process.argv[7]));
      if (results[0] && results[0].source) {
        process.stdout.write(results[0].source);
      }
    }());
    break;

}

// recurse into directories, process .js files, ignore others
// (no protection against cycles)
function processJSfiles(paths,action) {
  var stat,source;
  var results = [];
  paths.forEach(function(path) {
    stat = fs.statSync(path);
    if (stat.isFile() && path.match(/\.js$/)) {
      source = fs.readFileSync(path,'utf8');
      results.push( action(path,source) );
    } else if (stat.isDirectory()) {
      var dirContents = fs.readdirSync(path);
      results.concat( processJSfiles(dirContents.map(function(p){return path+'/'+p})
                                    ,action) );
    } else {
      console.error("ignoring "+path);
    }
  }); 
  return results;
}

function updateFile(action) { return function(path,source) {
  var newSource = action(path,source);
  fs.writeFileSync(path,newSource);
}}
