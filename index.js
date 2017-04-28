#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require("path");
const templates = require('./templates.js');
const compile = require('node-elm-compiler').compile;
const yargs = require('yargs');

const STDOUT_KEY = '::stdout';
const defaultViewFunction = "view";
var renderDirName = '.elm-static-html';

var argv = yargs
    .usage('Usage: <command> [options]')
    .version()
    .help('h')
    .alias('h', 'help')
    .alias('f', 'filename')
    .describe('f', 'Provide an Elm file to compile to HTML')

    .alias('o', 'output')
    .describe('o', 'Write to a particular file. Defaults to STDOUT')

    .alias('v', 'verbose')
    .describe('v', 'Be more chatty')
    .default('v', false)

    .alias('c', 'config')
    .describe('c', 'Provide a json file for use as config')

    .describe('init-config', 'Generate an example config.json')

    .argv;

var standardizedConfig = function(config){
    if (typeof config === "string"){
        return {
            "output": config,
            "viewFunction": defaultViewFunction
        };
    }

    var keys = Object.keys(config);

    if (keys.indexOf("output") === -1 || keys.indexOf('viewFunction') === -1){
        console.error('Malformed config!', config);
        console.log('It should have an output field and a viewFunction field!');
        return null;
    }

    return config;
};

const isVerbose = argv.verbose;
const isInitConfig = (typeof argv.initConfig !== "undefined" && argv.initConfig);
const outputToStdOut = (typeof argv.o === "undefined");
const isUsingConfig = (typeof argv.c !== "undefined");

if (isInitConfig){
    if (isVerbose) console.log('Initializing elm-static-html.json..');
    fs.writeFileSync(
        path.join(process.cwd(), 'elm-static-html.json'),
        templates.generateConfig() + "\n"
    );
    if (isVerbose) console.log('Done!');

    return 0;
}


var config = null;

if (isUsingConfig){
    if (isVerbose) console.log('Using the config file', argv.config);
    try {
        config = require(path.join(process.cwd(), argv.config));

        Object.keys(config['files']).map(function(key){
            var standardized = standardizedConfig(config['files'][key]);
            config['files'][key] = standardized;
        });

    } catch (e) {
        console.error('Failed to load config file! You can make an initial config through --init');
        console.error(e);
        return -1;
    }
} else {
    if (typeof argv.filename === "undefined") {
        yargs.showHelp();
        return -1;
    }

    if (isVerbose) console.log('Loading file.. ', argv.filename);
    if (isVerbose && outputToStdOut) console.log('Outputting to stdout..');
    var outputName = null;

    if (outputToStdOut) {
        outputName = STDOUT_KEY;
    } else {
        outputName = argv.output;
    }

    config = {
        files : {}
    };

    config.files[argv.filename] = {
        'output': outputName,
        'viewFunction': defaultViewFunction
    };
}


var getModuleNames = function(config) {
    const moduleNames = Object.keys(config.files).map(function(filename){
        // load the file and try to read the module name by spliting
        var fileContents = fs.readFileSync(filename, 'utf-8');
        var moduleName = fileContents.split('\n')[0].split(' ')[1].trim();

        if (moduleName.length === 0){
            console.error('No module name provided!');
            console.error('skipping ', filename)
            return null;
        } else if (moduleName === 'PrivateMain'){
            console.error('You can\'t call your module PrivateMain! Please rename it.');
            return null;
        }

        var viewFunction = config.files[filename].viewFunction
        var output = config.files[filename].output;

        return { filename: filename, moduleName: moduleName, output: output, func: viewFunction };
    }).filter(function(moduleName){
        return moduleName != null;
    });

    return moduleNames;
};

const moduleNames = getModuleNames(config);


// fix an elm package file so that it will work with our project
// and install our deps
var fixElmPackage = function(workingDir, elmPackage){
    elmPackage['native-modules'] = true;
    var sources = elmPackage['source-directories'].map(function(dir){
        return path.join(workingDir, dir);
    });
    sources.push('.');

    elmPackage['source-directories'] = sources;
    elmPackage['dependencies']["eeue56/elm-html-in-elm"] = "2.0.0 <= v < 3.0.0";

    return elmPackage;
};

var elmPackage = null;

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
elmPackage = fixElmPackage(process.cwd(), elmPackage);
var dirPath = path.join(process.cwd(), renderDirName);

// make our cache dir
try{
    fs.mkdirSync(renderDirName);
    fs.mkdirSync(path.join(dirPath, 'Native'));
} catch (e) {
    // ignore this and try to continue anyway
}

var elmPackagePath = path.join(dirPath, 'elm-package.json');
var privateMainPath = path.join(dirPath, 'PrivateMain.elm');
var nativePath = path.join(dirPath, 'Native/Jsonify.js');

// write things so we can run elm make
fs.writeFileSync(elmPackagePath, JSON.stringify(elmPackage));

var rendererFileContents = templates.generateRendererFile(moduleNames);
fs.writeFileSync(privateMainPath, rendererFileContents);

var nativeString = templates.generateNativeModuleString(projectName);
fs.writeFileSync(nativePath, nativeString);

if (isVerbose) console.log('wrote template files to..', renderDirName);

var options = {
    yes: true,
    cwd: dirPath,
    output: 'elm.js'
};


var compileProcess = compile(privateMainPath, options);


compileProcess.on('exit',
    function(exitCode){
        if (exitCode !== 0){
            console.log("Exited with the code", exitCode);
            console.log('Trying to proceed anyway..');
        }

        var Elm = require(path.join(dirPath, 'elm.js'));
        var elmApp = Elm.PrivateMain.worker();
        elmApp.ports.htmlOut.subscribe(function(htmlOutput){

            htmlOutput.map(function(group){
                var outputFile = group[0];
                var html = group[1];

                if (outputFile === STDOUT_KEY){
                    if (isVerbose) console.log('Generated the following strings..');
                    console.log(html + "\n");
                } else {
                    if (isVerbose) console.log('Saving to', argv.output);
                    fs.writeFileSync(outputFile, html + "\n");
                }

                if (isVerbose) console.log('Done!');

            })

        });
    }
);
