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
    processJSfiles(process.argv.slice(3),scope_utils.collect);
    break;

  case "findVar": // file varName line column
    // experimental, temporary
    processJSfiles([process.argv[3]]
                  ,scope_utils.findVar(process.argv[4]
                                      ,{line:   +process.argv[5]
                                       ,column: +process.argv[6]}));
    break;

  case "rename": // file oldName line column newName
    // experimental, work in progress
    processJSfiles([process.argv[3]]
                  ,scope_utils.rename(process.argv[4]
                                     ,{line:   +process.argv[5]
                                      ,column: +process.argv[6]}
                                     ,process.argv[7]));
    break;

}

// recurse into directories, process .js files, ignore others
// (no protection against cycles)
function processJSfiles(paths,action) {
  var stat,source;
  paths.forEach(function(path) {
    stat = fs.statSync(path);
    if (stat.isFile() && path.match(/\.js$/)) {
      source = fs.readFileSync(path,'utf8');
      action(path,source);
    } else if (stat.isDirectory())
      processJSfiles(fs.readdirSync(path).map(function(p){return path+'/'+p}),action);
    else
      console.error("ignoring "+path);
  }); 
}

function updateFile(action) { return function(path,source) {
  var newSource = action(path,source);
  fs.writeFileSync(path,newSource);
}}
