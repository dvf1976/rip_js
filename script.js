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
    /*
    copyDotDVDProgressBar = new ProgressBar({
        schema: '[:bar] :current/:total :percent :elapseds :etas Copying ' + dotDVDFileName,
        current: 0,
        total: 100
    }),
    copyDotMD5ProgressBar = new ProgressBar({
        schema: '[:bar] :current/:total :percent :elapseds :etas Copying ' + dotMD5FileName,
        current: 0,
        total: 100
    }),
    copyISOProgressBar = new ProgressBar({
        schema: '[:bar] :current/:total :percent :elapseds :token1mins mins Copying ' + inputFileName,
        current: 0,
        total: 100
    }),
    getChaptersProgressBar = new ProgressBar({
        schema: '[:bar] :current/:total :percent :elapseds :token1mins mins Scanning ' + outputFileName,
        current: 0,
        total: 100
    });
    */
//require('events').EventEmitter.defaultMaxListeners = 0;

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
                'min-duration' : 1200,
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
        paramsList = [],
        progressBars = [];
        
    if (chapters.length === 0) {
        ripParams['main-feature'] = true;
        paramsList.push(ripParams);
    } else {
        paramsList = _.map(chapters, function(chapterNumber, index) {
            return _.extend({}, ripParams, {
                title : chapterNumber,
                output : outputLocation.replace('DDD', index + 1) 
            });
        });
    }
    
    hbjs._usage.disable();
    async.eachLimit(paramsList, 1, function (params, nextRip) {
        /*
        var ripVideoProgressBar = new ProgressBar({
            schema: '[:bar] :current/:total :percent :elapseds :token1mins mins Ripping ' + params.output,
            current: 0,
            total: 100
        });
        */
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
            if (progress) {
                console.log(JSON.stringify(progress));
            }
            /*
            ripVideoProgressBar.update(progress.percentComplete, {
                token1mins: Math.round(progress.eta)
            });
            */
        }).on('complete', function () {
            nextRip(null, params);
        });
    }, function (err) {
        if (!err) {
            return;
        }
        console.log('error: ' + err);
    });

    /*
    _.each(iterativeParams, function (params) {
        var ripVideoProgressBar = new ProgressBar({
            schema: '[:bar] :current/:total :percent :elapseds :token1mins mins Ripping ' + params.output,
            current: 0,
            total: 100
        });
        console.log('params: ' + JSON.stringify(params));

        hbjs.spawn(params).on('error', function (err) {
            console.log('error: ' + err);
        }).on('output', function (output) {
            // console.log('output: ' + output);
        }).on('progress', function (progress) {
            ripVideoProgressBar.update(progress.percentComplete, {
                token1mins: Math.round(progress.eta)
            });
        });
    });
    */
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
    var readStream = fs.createReadStream(source),
        writeStream = fs.createWriteStream(target),
        stat = fs.statSync(source),
        fileSize = stat.size;

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

    readStream.pipe(writeStream);
}

/*
_.each([copyDotDVDProgressBar, copyDotMD5ProgressBar, copyISOProgressBar, getChaptersProgressBar, ripVideoProgressBar], function (pb) {
    pb.update(0, {
        token1mins: 0
    });
});
*/
// UGH. Need to rewrite as promises!
getChapters(inputFileLocation, outputFileLocation).then(
    function (chapters) {
        runHandbrake(inputFileLocation, outputFileLocation, chapters);
    }
);
// 
// copyFile(dotMD5FileLocation, BACKUP_DIRECTORY + dotMD5FileName, copyDotMD5ProgressBar);
// copyFile(inputFileLocation, BACKUP_DIRECTORY + inputFileName, copyISOProgressBar);
// copyFile(dotDVDFileLocation, BACKUP_DIRECTORY + dotDVDFileName, copyDotDVDProgressBar);


//watcher.on('add', processISO);

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';
