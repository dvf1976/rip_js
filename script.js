'use strict';

process.setMaxListeners(0);

var config = require('config'),
    DISC_IMAGES_DIRECTORY = config.get('DISC_IMAGES_DIRECTORY'),
    BACKUP_DIRECTORY = config.get('BACKUP_DIRECTORY'),
    VIDEO_DIRECTORY = config.get('VIDEO_DIRECTORY'),
    DEBUG = true,
    path = require('path'),
    argv = require('minimist')(process.argv.slice(2)),
    fs = require('fs'),
    _ = require('lodash'),
    // ProgressBar = require('ascii-progress'),
    Set = require('collections/set'),
    async = require('async'),
    inputFileName = checkInputFileName(argv.input || argv.disc || argv.bluray || argv.iso || argv.inputFileName),
    mediaType = (argv.media_type === 'tv' || argv['media-type'] === 'tv' || argv['mediaType'] === 'tv') ? 'tv' : 'movie',
    dotDVDFileName = inputFileName.replace('.iso', '.dvd'),
    dotMD5FileName = inputFileName.replace('.iso', '.md5'),
    outputFileName = checkOutputFileName(argv.output || argv.outputFileName),
    inputFileLocation = DISC_IMAGES_DIRECTORY + inputFileName,
    dotDVDFileLocation = DISC_IMAGES_DIRECTORY + dotDVDFileName,
    dotMD5FileLocation = DISC_IMAGES_DIRECTORY + dotMD5FileName,
    outputFileLocation = '',
    baseHandbrakeParams = {
        encoder : 'x265',
        quality : '24.0',
        aencoder : 'av_aac',
        'custom-anamorphic' : true,
        'keep-display-aspect' : true,
        'subtitle' : 'scan',
        'subtitle-forced' : '1',
        'subtitle-burn' : '1',
        'no-usage-stats' : '1',
        rate : '29.97'
    };

function checkInputFileName(f) {
    console.log(DISC_IMAGES_DIRECTORY);
    if (!f) {
        throw new Error('must pass --input or --disc or --bluray or --iso or --inputFileName');
    }
    return f;
}

function checkOutputFileName(f) {
    if (!f) {
        throw new Error('must pass --output or --outputFileName');
    }
    return f;
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

function getChapters(inputLocation, outputLocation) {
    return new Promise(function(resolve, reject) {
        var hbjs = require('handbrake-js'),
            params = {
                input : inputLocation,
                output : outputLocation,
                'min-duration' : (60 * 18),
                'no-usage-stats' : '1',
                t : 0
            },
            chapters = [];
    
        hbjs._usage.disable();

        console.log('input path: ' + inputLocation);
        console.log('output path: ' + outputLocation);

        if (mediaType !== 'tv') {
            resolve(chapters);
            return;
        }

        hbjs.spawn(params).on('error', function (err) {
            console.log('error: ' + err);
        }).on('output', function (output) {
            _.each(output.split('\n'), function (line) {
                var matchingChapter;
                if (line.indexOf('+ title') === 0) {
                    matchingChapter = line.match(/\+ title (\d+)/)[1];
                    console.log(matchingChapter);
                    chapters.push(matchingChapter);
                }
            });
        }).on('complete', function () {
            resolve(chapters);
        });
    });
}

function runHandbrake(inputLocation, outputLocation, chapters) {
    var hbjs = require('handbrake-js'),
        current = -1,
        fileParams = {
            'no-usage-stats' : '1',
            input : inputLocation,
            output : outputLocation,
        },
        ripParams = _.extend({}, baseHandbrakeParams, fileParams),
        paramsList = [];
        
    if (chapters.length === 0) {
        ripParams['main-feature'] = true;
        paramsList.push(ripParams);
    } else {
        paramsList = _.map(chapters, function(chapterNumber, index) {
            return _.extend({}, ripParams, {
                title : chapterNumber,
                output : outputLocation.replace('DDD', _.padStart(index + 1, 3, '0')) 
            });
        });
    }
    
    hbjs._usage.disable();
    async.eachLimit(paramsList, 1, function (params, nextRip) {
        var percentComplete = 0;
        console.log('params: ' + JSON.stringify(params));

        if (fs.existsSync(params.output)) {
            console.log('output already exists: ' + params.output);
            nextRip(null, params);
            return;
        }

        hbjs.spawn(params).on('error', function (err) {
            console.log('error: ' + err);
        }).on('output', function (output) {
            // console.log('output: ' + output);
        }).on('progress', function (progress) {
            console.log('ripping: ' + JSON.stringify(progress));
            //if ((progress) && (progress.taskCount === 2) && (progress.percentComplete !== percentComplete)) {
            //    console.log('ripping to ' + params.output + ' ' + (progress.percentComplete) + '% done');
            //    percentComplete = progress.percentComplete;
            //}
        }).on('complete', function () {
            nextRip(null, params);
        });
    }, function (err) {
        if (!err) {
            return;
        }
        console.log('error: ' + err);
    });
}

/*
function copyFile(source, target, progressBar) {
    var progress = require('progress-stream'),
        readStream = fs.createReadStream(source),
        writeStream = fs.createWriteStream(target),
        stat = fs.statSync(source),
        fileSize = stat.size,
        progressStream = progress({length: fileSize, time: 100});

    writeStream.on("error", function(err) {
        reject(err);
    });

    writeStream.on("close", function(ex) {
        readStream.close();
    });

    readStream.on("error", function(err) {
        console.log('err: ' + err);
    });

    readStream.on('end', function () {
        writeStream.close();
    });

    progressStream.on('progress', function (progress) {
        progressBar.update(progress.percentage / 100, {
            token1mins: Math.round(progress.eta / 60)
        });
    });

    readStream.pipe(progressStream).pipe(writeStream);
}
*/

function copyFile(source, target) {
    var progress = require('progress-stream'),
        readStream = fs.createReadStream(source),
        writeStream = fs.createWriteStream(target),
        stat = fs.statSync(source),
        fileSize = stat.size,
        progressPercentage = 0,
        progressStream = progress({length: fileSize, time: 100});

    writeStream.on("error", function(err) {
        reject(err);
    });

    writeStream.on("close", function(ex) {
        readStream.close();
    });

    readStream.on("error", function(err) {
        console.log('err: ' + err);
    });

    readStream.on('end', function () {
        writeStream.close();
    });

    progressStream.on('progress', function (progress) {
        if (progressPercentage !== Number.parseInt(progress.percentage)) {
            console.log('copying to ' + target + ' ' + (Number.parseInt(progress.percentage)) + '% done');
            progressPercentage = Number.parseInt(progress.percentage);
        }
    });

    readStream.pipe(progressStream).pipe(writeStream);
}

// UGH. Need to rewrite as promises!
getChapters(inputFileLocation, outputFileLocation).then(
    function (chapters) {
        runHandbrake(inputFileLocation, outputFileLocation, chapters);
    }
);
// 
copyFile(dotMD5FileLocation, BACKUP_DIRECTORY + dotMD5FileName);
if (fs.existsSync(BACKUP_DIRECTORY + inputFileName)) {
    console.log('file already exists at: ' + BACKUP_DIRECTORY + inputFileName);
} else {
    copyFile(inputFileLocation, BACKUP_DIRECTORY + inputFileName);
}
copyFile(dotDVDFileLocation, BACKUP_DIRECTORY + dotDVDFileName);


//watcher.on('add', processISO);

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';
