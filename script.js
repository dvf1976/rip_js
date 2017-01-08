'use strict';

var hbjs = require('handbrake-js');
var pace = require('pace');
var progressbar = pace(100);
var percentComplete = 0;

hbjs.spawn({
	input : '/mnt/local_disc_images/SILENT_MOVIE.iso',
	output : 'Silent Movie.m4v',
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
	var percentComplete = progress.percentComplete;
	progressbar.op(progress.percentComplete);
	/*
	if (Number(percentComplete) === Number(parseInt(percentComplete))) {
		console.log(
			'Percent Complete: %s, ETA: %s',
			percentComplete,
			progress.eta
		);
	}
	*/
});

// my $base_handbrake_statement = '%s -i "%s" %s -o "%s" -e x265 -q 24.0 -E av_aac --custom-anamorphic --keep-display-aspect  -r 29.97 -O';
