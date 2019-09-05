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
    _cliProgress = require('cli-progress'),
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
        // encoder : 'x265',
        // quality : '24.0',
        // aencoder : 'av_aac',
        // 'custom-anamorphic' : true,
        // 'keep-display-aspect' : true,
        // 'preset' : 'Roku 2160p60 4K HEVC Surround',
        'preset' : 'Apple 2160p60 4K HEVC Surround',
        'audio' : '1',
        //'chapters' : '1-3',
        //'preset' : 'Fast 1080p30',
        'subtitle' : 'scan',
        'subtitle-forced' : '1',
        'subtitle-burn' : '1',
        //'no-usage-stats' : '1',
        // rate : '29.97'
    },
    TV_SHOW_MAX_DURATION = 60 * 60;

function checkInputFileName(f) {
    //console.log(DISC_IMAGES_DIRECTORY);
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

function getChapterNumberToDuration(output) {
    return new Promise(function(resolve, reject) {
        var chapterNumberToDuration = {},
            matchingChapter, durationHours, durationMinutes, durationSeconds, totalDuration;
        // console.log('output: ' + output);
        _.each(output.split('\n'), function (line) {
            if (line.indexOf('+ title') === 0) {
                matchingChapter = line.match(/\+ title (\d+)/)[1];
                /*
                console.log('matchingChapter: ' + matchingChapter);
                */
            }
            if (line.indexOf('  + duration') === 0) {
                /*
                console.log('line: ' + line);
                */
                durationHours = parseInt(line.match(/  \+ duration: 0?(\d+):0?(\d+):0?(\d+)/)[1]);
                durationMinutes = parseInt(line.match(/  \+ duration: 0?(\d+):0?(\d+):0?(\d+)/)[2]);
                durationSeconds = parseInt(line.match(/  \+ duration: 0?(\d+):0?(\d+):0?(\d+)/)[3]);
                /*
                console.log('durationHours: ' + durationHours);
                console.log('durationMinutes: ' + durationMinutes);
                console.log('durationSeconds: ' + durationSeconds);
                */

                totalDuration = ((60 * 60) * durationHours) + (60 * durationMinutes) + durationSeconds;
                /*
                console.log('matchingChapter: ' + matchingChapter);
                console.log('totalDuration: ' + totalDuration);
                */
                chapterNumberToDuration[matchingChapter] = totalDuration;
            }
        });

        console.log('chapterNumberToDuration: ' + JSON.stringify(chapterNumberToDuration));

        resolve(chapterNumberToDuration);
    });
}

function getChapters(inputLocation, outputLocation) {
    return new Promise(function(resolve, reject) {
        var hbjs = require('handbrake-js'),
            params = {
                input : inputLocation,
                output : outputLocation,
                'min-duration' : (60 * 18),
		        //'max-duration' : (60 * 55),
                'no-usage-stats' : '1',
                t : 0
            };

        //hbjs._usage.disable();

        /*
        console.log('input path: ' + inputLocation);
        console.log('output path: ' + outputLocation);
        console.log('mediaType: ' + mediaType);
        */

        if (mediaType !== 'tv') {
            resolve([]);
            return;
        }

        delete params['no-usage-stats']
        console.log('params: ' + JSON.stringify(params));

        hbjs.exec(params, function (err, output, stderr) {
            getChapterNumberToDuration(stderr).then(
                function (chapterNumberToDuration) {
                    var chapters = [];
                    _.each(_.keys(chapterNumberToDuration), function (chapterNumber) {
                        // console.log(chapterNumber);
                        if (chapterNumberToDuration[chapterNumber] < TV_SHOW_MAX_DURATION) {
                            chapters.push(chapterNumber);
                        }
                    });
                    /*
                    console.log(chapters);
                    */

                    // chapters.push(matchingChapter);
                    resolve(chapters);
                }
            );
            // console.log('output: ' + output);
            // console.log('stderr: ' + stderr);
        });
    });
}

function runHandbrake(inputLocation, outputLocation, chapters) {
    var hbjs = require('handbrake-js'),
        fileParams = {
            //'no-usage-stats' : '1',
            input : inputLocation,
            output : outputLocation,
            verbose : 0
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

    // hbjs._usage.disable();
    async.eachLimit(paramsList, 1, function (params, nextRip) {
        var percentComplete, bar1;

        // console.log('params: ' + JSON.stringify(params));
	// nextRip(null, params);
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
            // console.log('ripping: ' + JSON.stringify(progress));
            // if ((progress) && (progress.taskCount === 2) && (progress.percentComplete !== percentComplete)) {
            //    console.log('ripping to ' + params.output + ' ' + (progress.percentComplete) + '% done');
            //    percentComplete = progress.percentComplete;
            // }
            if ((progress.taskCount === 2) && (!bar1)) {
		bar1 = new _cliProgress.Bar({
			// format : ' |- Ripping ' + inputFileName + ' | {percentage}%' + ' - ' + '||{bar}||',
			format : 'ripping ' + inputFileName + ' [{bar}] {percentage}% || {value}/{total} Chunks || Speed: {speed}',
			barCompleteChar: '\u2588',
			barIncompleteChar: '\u2591',
			hideCursor : true
		    });

		    //}, _cliProgress.Presets.shades_classic);

		bar1.start(1000, 0);
	    }
            if (parseInt(progress.percentComplete * 10, 10) !== percentComplete) {
		/*
		console.log('bar: ');
		console.log(bar);
		bar.tick(1);
		*/
            	// console.log('ripping to ' + params.output + ' ' + (progress.percentComplete) + '% done');

            	percentComplete = parseInt(progress.percentComplete * 10);
		bar1.update(percentComplete);
            }
        }).on('complete', function () {
            bar1.stop();
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
/*
if (fs.existsSync(dotMD5FileLocation)) {
	copyFile(dotMD5FileLocation, BACKUP_DIRECTORY + dotMD5FileName);
}
if (fs.existsSync(BACKUP_DIRECTORY + inputFileName)) {
    console.log('file already exists at: ' + BACKUP_DIRECTORY + inputFileName);
} else {
    copyFile(inputFileLocation, BACKUP_DIRECTORY + inputFileName);
}
if (fs.existsSync(dotDVDFileLocation)) {
	copyFile(dotDVDFileLocation, BACKUP_DIRECTORY + dotDVDFileName);
}
*/


//watcher.on('add', processISO);

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';