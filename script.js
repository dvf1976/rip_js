'use strict';

//var DISC_IMAGES_DIRECTORY = '/mnt/local_disc_images/',
//    VIDEO_DIRECTORY = '/mnt/roku_videos/',
var DISC_IMAGES_DIRECTORY = '/data/',
    BACKUP_DIRECTORY1 = '/mnt/sdb/',
    BACKUP_DIRECTORY2 = '/mnt/sdc/',
    VIDEO_DIRECTORY = '/mnt/roku_videos/',
    path = require('path'),
    argv = require('minimist')(process.argv.slice(2)),
    fs = require('fs'),
    _ = require('lodash'),
    Set = require('collections/set'),
    inputFileName = argv.input || argv.disc || argv.bluray || argv.iso || argv.inputFileName,
    outputFileName = argv.output || argv.outputFileName,
    inputFileLocation = DISC_IMAGES_DIRECTORY + inputFileName,
    outputFileLocation = '';

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

outputFileLocation = VIDEO_DIRECTORY + outputFileName;

if (!fs.existsSync(inputFileLocation)) {
    console.log('no file at: ' + inputFileLocation);
    return;
}
if (fs.existsSync(outputFileLocation)) {
    console.log('file already exists at: ' + outputFileLocation);
    return;
}

function runHandbrake(inputLocation, outputLocation) {
    var hbjs = require('handbrake-js'),
        progressbar = require('progressbar').create().step('Encoding ' + outputLocation).setTotal(100);

    console.log('input path: ' + inputLocation);
    console.log('output path: ' + outputLocation);

    hbjs.spawn({
        input : inputLocation,
        output : outputLocation,
        encoder : 'x265',
        quality : '24.0',
        aencoder : 'av_aac',
        'custom-anamorphic' : true,
        'keep-display-aspect' : true,
        'main-feature' : true,
        'subtitle' : 'scan',
        'subtitle-forced' : '1',
        'subtitle-burn' : '1',
        rate : '29.97'
    }).on('error', function (err) {
        console.log('error: ' + err);
    }).on('output', function (output) {
        // console.log('output: ' + output);
    }).on('progress', function (progress) {
        progressbar.setTick(progress.percentComplete);
    });
}

function copyFile(source, target, cb) {
    var cbCalled = false,
        readStream = fs.createReadStream(source),
        writeStream = fs.createWriteStream(target),
        stat = fs.statSync(source),
        fileSize = stat.size,
        progressbar = require('progressbar').create().step('Copying ' + source + ' to ' + target).setTotal(100),
        bytesCopied = 0,
        milestones = new Set(_.range(100));

    function done(err) {
        if (!cbCalled) {
            cb && cb(err);
            cbCalled = true;
        }
    }

    writeStream.on("error", function(err) {
        done(err);
    });

    writeStream.on("close", function(ex) {
        readStream.close();
        progressbar.finish();
        done();
    });

    readStream.on("error", function(err) {
        done(err);
    });

    readStream.on('end', function () {
        writeStream.close();
    });

    readStream.on('data', function (buffer) {
        var length = buffer.length,
        percentComplete;

        bytesCopied += length,
        percentComplete = ((bytesCopied / fileSize) * 100).toFixed(2);

        milestones.forEach(milestone => {
            if (percentComplete >= milestone) {
                progressbar.setTick(percentComplete);
                milestones.remove(milestone);
            };
        });

        writeStream.write(buffer);
    });
}

copyFile(inputFileLocation, BACKUP_DIRECTORY1 + inputFileName, (err) => {
	copyFile(inputFileLocation, BACKUP_DIRECTORY2 + inputFileName, () => {});
});

runHandbrake(inputFileLocation, outputFileLocation);

//watcher.on('add', processISO);

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';