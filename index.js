#!/usr/bin/env node

var fs = require('fs');
var os = require('os');
var path = require("path");
var compile = require('node-elm-compiler').compile;
var yargs = require('yargs');

var argv = yargs
    .usage('Usage: -f $elm-filename -o $output')
    .demand(['filename'])
    .alias('f', 'filename')
    .describe('f', 'Provide an Elm file to compile to HTML')

    .alias('o', 'output')
    .describe('o', 'Write to a particular file. Defaults to STDOUT')

    .alias('v', 'verbose')
    .describe('v', 'Be more chatty')

    .argv;

var renderDirName = '.elm-static-html';
var isVerbose = (typeof argv.v !== "undefined" && argv.v);
var outputToStdOut = (typeof argv.o === "undefined");

if (isVerbose) console.log('Loading file.. ', argv.filename);
if (isVerbose && outputToStdOut) console.log('Outputting to stdout..');


// load the file and try to read the module name by spliting
var fileContents = fs.readFileSync(argv.filename, 'utf-8');
var moduleName = fileContents.split('\n')[0].split(' ')[1].trim();

if (moduleName.length === 0){
    console.error('No module name provided!');
    return -1;
} else if (moduleName === 'PrivateMain'){
    console.error('You can\'t call your module PrivateMain! Please rename it.');
    return -1;
}


var elmPackage = null;

// fix an elm package file so that it will work with our project
// and install our deps
var fixElmPackage = function(elmPackage){
    elmPackage['native-modules'] = true;
    var sources = elmPackage['source-directories'].map(function(dir){
        return path.join(process.cwd(), dir);
    });
    sources.push('.');

    elmPackage['source-directories'] = sources;
    elmPackage['dependencies']["eeue56/elm-html-in-elm"] = "1.0.1 <= v < 2.0.0";

    return elmPackage;
};

// try to load elm-package.json
try {
    elmPackage = require(path.join(process.cwd(), 'elm-package.json'));
} catch (e){
    console.error('Failed to load elm-package.json!');
    console.error('Make sure elm-package.json is in the current dir');
    return -1;
}

// grab the user/project string from the elm-package file
var projectName = elmPackage['repository'].replace('https://github.com/', '').replace('.git', '').replace('/', '$');

// literally the only reason why this has to be an npm package
var nativeString = `
var _${projectName}$Native_Jsonify = {
    stringify: function(thing) { return JSON.stringify(thing); }
};`;


// this is our render's file contents
// basically just boilerplate
var rendererFileContents = `
port module PrivateMain exposing (..)

import Platform
import Html exposing (Html)
import ElmHtml.InternalTypes exposing (decodeElmHtml)
import ElmHtml.ToString exposing (nodeTypeToString)
import Json.Decode as Json
import Native.Jsonify

import ${moduleName}


asJsonString : Html msg -> String
asJsonString = Native.Jsonify.stringify

decoded : String
decoded =
    case Json.decodeString decodeElmHtml (asJsonString ${moduleName}.view) of
        Err str -> str
        Ok str -> nodeTypeToString str

main = Platform.program
    { init = ((), htmlOut (decoded) )
    , update = (\\_ b -> (b, Cmd.none))
    , subscriptions = (\\_ -> Sub.none)
    }


port htmlOut : String -> Cmd msg
`;



elmPackage = fixElmPackage(elmPackage);

var dirPath = path.join(process.cwd(), renderDirName);

try{
    fs.mkdirSync(renderDirName);
    fs.mkdirSync(path.join(dirPath, 'Native'));
} catch (e) {
    // ignore this and try to continue anyway
}

var elmPackagePath = path.join(dirPath, 'elm-package.json');
var privateMainPath = path.join(dirPath, 'PrivateMain.elm');
var nativePath = path.join(dirPath, 'Native/Jsonify.js');

fs.writeFileSync(elmPackagePath, JSON.stringify(elmPackage));
fs.writeFileSync(privateMainPath, rendererFileContents);
fs.writeFileSync(nativePath, nativeString)

if (isVerbose) console.log('wrote template files to..', renderDirName);

var options = {
    yes: true,
    cwd: dirPath,
    output: 'elm.js'
};

var compileProcess = compile(privateMainPath, options);


compileProcess.on('exit',
    function(exitCode){
        var Elm = require(path.join(dirPath, 'elm.js'));

        var elmApp = Elm.PrivateMain.worker();

        elmApp.ports.htmlOut.subscribe(function(html){

            if (outputToStdOut){
                if (isVerbose) console.log('Generated the following string..');
                console.log(html + "\n");
            } else {
                if (isVerbose) console.log('Saving to', argv.output);
                fs.writeFileSync(argv.output, html);
            }

            if (isVerbose) console.log('Done!');
        });
    }
);
