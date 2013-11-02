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
var ast_utils   = require("./ast_utils.js");

var parseThen   = ast_utils.parseThen;

process.argv.shift(); // node
process.argv.shift(); // estr.js

// CLI, select task to perform
switch (process.argv.shift()) {

  case "help":
    console.log('estr (Ecmascript traversals)');
    console.log();
    console.log('estr tags [--classic] [-o tagfile] ..paths');
    console.log('   traverse paths, extract tags from .js-files, write to file "tags"');
    console.log('   --classic  : record imprecise tags (function assignments and properties)');
    console.log('   -o tagfile : write to file tagfile');
    console.log();
    console.log('estr rename [-i.suffix] file.js oldName <line> <column> newName');
    console.log('   rename oldName (at <line> <column>) to newName');
    console.log('   -i.suffix : update file.js in-place; save original to file.js.suffix');
    console.log();
    console.log('estr findVar file.js name <line> <column>');
    console.log('   find binding and other occurrences for name');
    break;

  case "tags":  // [--classic] [-o tagfile] ..paths
    (function(){
      // fairly stable, useable
      var options = tags.flags();
      processJSfiles(process.argv,tags.generateTags);
      fs.writeFileSync(options.tagFile,tags.tagFile().join('\n')); // TODO: OS-dep line end?
    })();
    break;

  case "collectDecls":  // ..paths
    // experimental, temporary
    (function(){
      var collect = scope_utils.collect;

      var results = processJSfiles(process.argv,parseThen(collect));

      if (results[0]) {
        if (results[0].parseError) {

          console.error("parse error in "+results[0].sourcefile
                       ,results[0].parseError);
          exitCode(1);

        } else if (results[0].decls){

          if (results[0].warnings) {
            console.warn(results[0].warnings);
          }

          results[0].decls.forEach(function(decl){
            console.log(decl[0].name,decl[0].loc.start,decl[1]);
          });

        } else {

          console.error('unknown result',results[0]);
          exitCode(1);

        }
      }
    }());
    break;

  case "findVar": // file varName line column
    // experimental, temporary
    (function(){
      var file    = process.argv.shift();
      var varName = process.argv.shift();
      var line    = +process.argv.shift();
      var column  = +process.argv.shift();

      var findVar = scope_utils.findVar;

      var results = processJSfiles([file]
                                  ,parseThen(findVar(varName
                                                    ,{line:   line
                                                     ,column: column})));

      if (results[0]) {
        if (results[0].warnings) {
          console.warn(results[0].warnings);
        }

        if (results[0].scope && results[0].binding) {

          var scope   = results[0].scope;
          var binding = results[0].binding;

          console.log('binding scope: ');
          console.log(scope.type,scope.loc);

          console.log('binding occurrence: ');
          console.log(file+' '+binding[1]+' '+locColSpan(binding[0].loc));
          console.log('other occurrences: ');
          binding[0].occurrences.forEach(function(o){
                                          console.log(file+' '+o.name+' '+locColSpan(o.loc))
                                         });

        } else if (results[0].parseError) {

          console.error("parse error in "+results[0].sourcefile
                       ,results[0].parseError);
          exitCode(1);

        } else if (results[0].error) {

          console.error(results[0].error.message);
          exitCode(1);

        } else {

          console.error('unknown result',results[0]);
          exitCode(1);

        }
      }
    }());
    break;

  case "rename": // [-i.suffix] file oldName line column newName
    (function(){
      var inplace;
      if (inplace = process.argv[0].match(/^-i(\S*)/))
        process.argv.shift();

      var file    = process.argv.shift();
      var oldName = process.argv.shift();
      var line    = +process.argv.shift();
      var column  = +process.argv.shift();
      var newName = process.argv.shift();

      var rename  = scope_utils.rename;

      var results = processJSfiles([file]
                                  ,parseThen(rename(oldName
                                                   ,{line:   line
                                                    ,column: column}
                                                   ,newName)));
      if (results[0]) {
        if (results[0].warnings) {
          console.warn(results[0].warnings);
        }

        if (results[0].source) {

          if (inplace) {  // update file inplace, with optional backup

            if (inplace[1]!=='') {
              console.info(inplace[1]);
              fs.writeFileSync(file+inplace[1],fs.readFileSync(file,'utf8'));
            }
            fs.writeFileSync(file,results[0].source);

          } else {        // no update, write renamed source to stdout

            process.stdout.write(results[0].source);

          }

        } else if (results[0].parseError) {

          console.error("parse error in "+results[0].sourcefile
                       ,results[0].parseError);
          exitCode(1);

        } else if (results[0].error) {

          console.error(results[0].error.message);
          exitCode(1);

        } else {

          console.error('unknown result',results[0]);
          exitCode(1);

        }
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

function locColSpan(loc) {
 return '{ line: '+loc.start.line
       +', column: '+loc.start.column+'-'+loc.end.column+'}'
}

function exitCode(code) {
  process.on('exit',function(){process.exit(1)});
}
