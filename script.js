'use strict';

var DISC_IMAGES_DIRECTORY = '/mnt/disc_images/',
    path = require('path'),
    argv = require('minimist')(process.argv.slice(2)),
    fs = require('fs'),
    /*
    chokidar = require('chokidar'),
    watcher = chokidar.watch(DISC_IMAGES_DIRECTORY + '*.iso', {
        persistent : true
    }),
    */
    _ = require('lodash'),
    inputFileName = argv.input || argv.disc || argv.bluray || argv.iso || argv.inputFileName,
    outputFileName = argv.output || argv.outputFileName,
    inputFileLocation = DISC_IMAGES_DIRECTORY + inputFileName,
    ISOS_TO_PROCESS = [
        DISC_IMAGES_DIRECTORY + 'Zoolander.iso'
    ];

if (!inputFileName) {
    console.log('must pass --input or --disc or --bluray or --iso or --inputFileName');
    return;
}

if (!outputFileName) {
    console.log('must pass --output or --outputFileName');
    return;
}
if (!outputFileName.endsWith('.m4v')) {
    outputFileName += '.m4v';
}

if (!fs.existsSync(inputFileLocation)) {
    console.log('no file at: ' + inputFileLocation);
    return;
}

function runHandbrake(isoPath) {
    var hbjs = require('handbrake-js'),
        pace = require('pace'),
        progressbar = pace(100),
        isoFileName = path.basename(isoPath);

    console.log('path: ' + isoPath);
    console.log('isoFileName: ' + isoFileName);

    hbjs.spawn({
        input : inputFileLocation,
        output : outputFileName,
        encoder : 'x265',
        quality : '24.0',
        aencoder : 'av_aac',
        'custom-anamorphic' : true,
        'keep-display-aspect' : true,
        rate : '29.97'
    }).on('error', function (err) {
        console.log('error: ' + err);
    }).on('output', function (output) {
        // console.log('output: ' + output);
    }).on('progress', function (progress) {
        progressbar.op(progress.percentComplete);
    });
}

function processISO(isoPath) {
    if (!_.includes(ISOS_TO_PROCESS, isoPath)) {
        runHandbrake(isoPath);
    }
}

//watcher.on('add', processISO);

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';