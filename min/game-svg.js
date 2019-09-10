(function () {
"use strict";

/*
Sorry, the code is a mess, as almost everything is global. But passing around objects with
getters and setters doesn't really fit, so there's not so much of an alternative.
I tried to comment the code instead more than usual, and hope that helps.

The script only uses ES5 and supports some outdated browsers, because I usually have to
support them, and also want to eventually turn this into an app for FFOS, so I have to
support them, too.
*/
/*
TOC
A. Global variables
B. Utility functions
C. Initialising
D. Sound
E. Drawing
F. Round management
G. Game loop
H. Init
*/

/*
A. Global variables
This part contains all global variables.
*/
var SVG,
	GRID = 60, //size of grid unit in pixels (TODO or use something 48/72-based? Then also SMALL_R = GRID * 5 / 24)
	SMALL_R = GRID * 0.2, //radius of small balls
	LARGE_R = 2 * SMALL_R, //typical radius of items (but may vary)
	PANEL_HEIGHT = GRID, //height of panel in pixels
	WIDTH = 7, HEIGHT = 10, //width and height of total area in GRID units
	INNER_WIDTH = WIDTH * GRID - 2 * SMALL_R, //width and height of inner area (i.e. where
	INNER_HEIGHT = HEIGHT * GRID - 2 * SMALL_R, //center of small balls can go) in pixels
	TOTAL_WIDTH = INNER_WIDTH + 2 * SMALL_R, //total width and height of canvas in pixels
	TOTAL_HEIGHT = INNER_HEIGHT + 2 * SMALL_R + PANEL_HEIGHT,
	EJECT_SPEED = TOTAL_WIDTH / 800, //speed of balls (in pixels/ms)
	END_SPEED = TOTAL_WIDTH / 500, //speed of balls moving to end position
	EJECT_TIME = GRID / EJECT_SPEED, //time between balls at start (in ms)
	KEY_PREFIX = 'schnark-back-', //prefix to keys when storing data (to avoid collision with other games)
	BACKGROUND_COLORS = ['hsl(250,10%,10%)', 'hsl(250,30%,20%)', 'hsl(30,30%,20%)'], //colors for background
	BALL_COLOR = 'yellow', //color of small balls
	START_COLOR = 270, //hue (as degree from HSV) for an item with value 0
	gameType, //type of the game (i.e. "level")
	allBalls,
/* all current balls as array of objects with the following properties:
x, y: position
vx, vy: speed
t: time till next collision or other action (always > 0)
action: what will happen at t
noWall: true if ball currently goes through wall, x is between -2 * SMALL_R and 0, and is equivalent to x + TOTAL_WIDTH
*/
	allItems,
/* all current items as array of objects with the following properties:
x, y: position
r: radius
n: hit number (n > 0), non-existent, but not yet deleted (n === 0), special item (n < 0)
Special items:
-1: new ball
-2: star
-3: back (reverse direction)
-4: destroy ball
-5: random direction
-6: toggle walls
-7: bomb
-8: obstacle
*/
	animations,
/* all current animations as array of objects with the following properties:
x, y: position
r: radius
t: current time
dur: duration
type: type of animation
*/
	startVx, startVy, //speed of balls at start
	endX, //end position of balls
	ballCount, //number of all balls
	livingBallCount, //number of balls still alive (during play)
	roundNumber, //current round number
	starCount, //stars collected so far
	noWalls, //pass through walls
	isRunning, //game is running
	isMuted, //sound off
	ctx, //context of canvas
	backgroundGradient, icons, //background gradient, icon sprites
	audio, //audio context
	disableEject, //function to remove all events related to ejecting
	menuShownFirstTime = true, //menu is shown for the first time in this session
	storageCache = {}, //cache for localStorage items
	rAF = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
		window.webkitRequestAnimationFrame || window.oRequestAnimationFrame;

//to embed the file icon.svg, uncomment the following line and insert the minified file as string
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="720"><defs><radialGradient id="green"><stop offset="0%" stop-color="#0f0" stop-opacity="0.3"/><stop offset="100%" stop-color="#0f0" stop-opacity="0.1"/></radialGradient><radialGradient id="yellow"><stop offset="0%" stop-color="#ff0" stop-opacity="0.3"/><stop offset="100%" stop-color="#ff0" stop-opacity="0.1"/></radialGradient><radialGradient id="red"><stop offset="0%" stop-color="#f00" stop-opacity="0.3"/><stop offset="100%" stop-color="#f00" stop-opacity="0.1"/></radialGradient><radialGradient id="white"><stop offset="0%" stop-color="#fff" stop-opacity="0.3"/><stop offset="100%" stop-color="#fff" stop-opacity="0.1"/></radialGradient><radialGradient id="blue"><stop offset="0%" stop-color="#00f" stop-opacity="0.3"/><stop offset="100%" stop-color="#00f" stop-opacity="0.1"/></radialGradient></defs><g transform="scale(2)"><g><circle fill="url(#green)" stroke="#0f0" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#0f0" d="M21 16h-5v5c0 .55-.45 1-1 1s-1-.45-1-1v-5H9c-.55 0-1-.45-1-1s.45-1 1-1h5V9c0-.55.45-1 1-1s1 .45 1 1v5h5c.55 0 1 .45 1 1s-.45 1-1 1z"/></g><g transform="translate(0 30)"><circle fill="url(#yellow)" stroke="#ff0" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#ff0" d="M15 20.27l5.17 3.12c.38.23.85-.11.75-.54l-1.37-5.88 4.56-3.95c.33-.29.16-.84-.29-.88l-6.01-.51-2.35-5.54a.5.5 0 0 0-.92 0l-2.35 5.54-6.01.51a.5.5 0 0 0-.28.88l4.56 3.95-1.37 5.88c-.1.43.37.77.75.54L15 20.27z"/></g><g transform="translate(0 60)"><circle fill="url(#red)" stroke="#f00" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#f00" d="M23 14H9.83l2.88-2.88a.996.996 0 1 0-1.41-1.41L6.71 14.3a.996.996 0 0 0 0 1.41l4.59 4.59a.996.996 0 1 0 1.41-1.41L9.83 16H23c.55 0 1-.45 1-1s-.45-1-1-1z"/></g><g transform="translate(0 90)"><circle fill="url(#yellow)" stroke="#ff0" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#ff0" d="M11 7v9c0 .55.45 1 1 1h2v7.15c0 .51.67.69.93.25l5.19-8.9a.995.995 0 0 0-.86-1.5H17l2.49-6.65A.994.994 0 0 0 18.56 6H12c-.55 0-1 .45-1 1z"/></g><g transform="translate(0 120)"><circle fill="url(#white)" stroke="#eef" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#eef" d="M20.48 12.03A5.99 5.99 0 0 0 14.6 7.2a6 6 0 0 0-5.32 3.23A4.8 4.8 0 0 0 5 15.2C5 17.85 7.15 20 9.8 20h10.4c2.21 0 4-1.79 4-4a3.98 3.98 0 0 0-3.72-3.97z"/></g><g transform="translate(0 150)"><circle fill="url(#blue)" stroke="#00f" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path fill="#00f" d="M23 14H9.83l2.88-2.88a.996.996 0 1 0-1.41-1.41L6.71 14.3a.996.996 0 0 0 0 1.41l4.59 4.59a.996.996 0 1 0 1.41-1.41L9.83 16H23c.55 0 1-.45 1-1s-.45-1-1-1z M17.81 9.71a.996.996 0 0 0 0 1.41L21.69 15l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L19.22 9.7c-.38-.38-1.02-.38-1.41.01z"/></g><g transform="translate(0 180)"><circle fill="url(#white)" stroke="#000" stroke-opacity="0.7" cx="15" cy="15" r="11.5"/><path stroke="#fff" stroke-width="0.5" d="M18.21 6.54c.25-.11.58-.18.92-.16.15.96-.32 1.71-.93 2.02-.35.18-.79.28-1.25.19a1.8 1.8 0 0 1-.98-.52c-.27-.27-.41-.57-.51-1a.92.92 0 0 0-.77-.74.9.9 0 0 0-.98.49c-.19.37-.05.8.03 1.24.28-.02.61-.08.92-.09.18.98.34 1.98.52 2.96 2.03.12 3.44.84 4.55 1.9 1.08 1.04 1.91 2.44 2.09 4.35.19 2.12-.59 3.76-1.5 4.89-.94 1.17-2.25 2.09-4.02 2.42-.98.18-2.01.15-2.89-.06a6.8 6.8 0 0 1-2.24-.98 6.72 6.72 0 0 1-2.73-3.71 7.05 7.05 0 0 1-.23-2.86c.13-.93.42-1.74.8-2.42.77-1.38 1.91-2.39 3.41-3.03-.16-1-.36-1.97-.51-2.98.3-.08.6-.16.92-.22-.06-.36-.15-.68-.15-1.04a1.88 1.88 0 0 1 .27-.92c.29-.48.83-.86 1.5-.9a1.85 1.85 0 0 1 1.32.44c.33.28.53.67.63 1.13.11.46.5.77.98.74.53-.04.97-.49.85-1.15z"/></g><g transform="translate(0 210)"><circle fill="#555" cx="15" cy="15" r="12"/></g><g transform="translate(0 240)"><path fill="#fff" d="M21.3 8.71a.996.996 0 0 0-1.41 0L15 13.59 10.11 8.7a.996.996 0 1 0-1.41 1.41L13.59 15 8.7 19.89a.996.996 0 1 0 1.41 1.41L15 16.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L16.41 15l4.89-4.89c.38-.38.38-1.02 0-1.4z"/></g><g transform="translate(0 270)"><path fill="#fff" d="M9.31 9.71a.996.996 0 0 0 0 1.41L13.19 15l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L10.72 9.7c-.38-.38-1.02-.38-1.41.01z M14.31 9.71a.996.996 0 0 0 0 1.41L18.19 15l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L15.72 9.7c-.38-.38-1.02-.38-1.41.01z"/></g><g transform="translate(0 300)"><path fill="#fff" d="M15 8v8.55c-.94-.54-2.1-.75-3.33-.32-1.34.48-2.37 1.67-2.61 3.07a4.007 4.007 0 0 0 4.59 4.65c1.96-.31 3.35-2.11 3.35-4.1V10h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2c-1.1 0-2 .9-2 2z"/></g><g transform="translate(0 330)"><path fill="#fff" d="M17 12.61V10h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2c-1.1 0-2 .9-2 2v3.61l2 2zM8.12 6.56a.996.996 0 1 0-1.41 1.41l8.29 8.3v.28c-.94-.54-2.1-.75-3.33-.32-1.34.48-2.37 1.67-2.61 3.07a4.007 4.007 0 0 0 4.59 4.65c1.96-.31 3.35-2.11 3.35-4.1v-1.58l5.02 5.02a.996.996 0 1 0 1.41-1.41L8.12 6.56z"/></g></g></svg>';

/*
B. Utility functions
This part contains some utility functions
*/
function pythagoras (x, y) {
	return x * x + y * y;
}

function storePersistent (key, val) {
	storageCache[key] = val;
	try {
		localStorage.setItem(KEY_PREFIX + key, val);
	} catch (e) {
	}
}

function clearPersistent (key) {
	delete storageCache[key];
	try {
		localStorage.removeItem(KEY_PREFIX + key);
	} catch (e) {
	}
}

function getPersistent (key) {
	if (key in storageCache) {
		return storageCache[key];
	}
	try {
		storageCache[key] = localStorage.getItem(KEY_PREFIX + key);
		return storageCache[key];
	} catch (e) {
	}
}

/*
We are at (x, y) and move with speed (vx, vy). When (if at all) will we pass (0, 0) at a distance <= r?
That is, we have (x + t * vx)^2 + (y + t * vy)^2 = r^2 as equation for t, i.e.
(vx^2 + vy^2) * t^2 + 2 * (x * vx + y * vy) * t + x^2 + y^2 - r^2 = 0, with solutions
(-(x * vx + y * vy) +- sqrt(d)) / (vx^2 + vy^2), where d = (x * vx + y * vy)^2 - (vx^2 + vy^2) * (x^2 + y^2 - r^2).
d = x^2 * vx^2 + 2 * x * y * vx * vy + y^2 * vy^2 - x^2 * vx^2 - y^2 * vx^2 - y^2 * vx^2 - y^2 * vy^2 + r^2 * (vx^2 + vy^2)
d = -(y^2 * vx^2 - 2 * x * y * vx * vy + x^2 * vy^2) + r^2 * (vx^2 + vy^2)
d = r^2 * (vx^2 + vy^2) - (y * vx - x * vy)^2
We are looking for the smallest t, where both solutions are positive real numbers.
*/

function getCollisionTime (x, y, vx, vy, r) {
	var v2 = pythagoras(vx, vy),
		s = y * vx - x * vy,
		d = r * r * v2 - s * s;
	if (d < 0) {
		return Infinity;
	}
	d = Math.sqrt(d);
	s = -(x * vx + y * vy);
	if (s - d <= 0) {
		return Infinity;
	}
	return (s - d) / v2;
}

/*
We are at (x, y) and hit a circle around (0, 0) with speed (vx, vy). How will we be reflected?
Write everything as complex numbers (i.e. we are at x + i * y, etc.). If we were at a purly
imaginary coordinate (i.e. exactily below or above 0), the new speed would be the complex
conjugate of the old speed. So we rotate into this situation, calculate the new speed, and
rotate back. This means the new speed is
conj((vx + i * vy) / ((x + i * y) * i)) * (x + i * y) * i =
conj(vx + i * vy) * -1 / conj(x + i * y) * (x + i * y) =
(-vx + i * vy) / (x^2 + y^2) * (x + i * y)^2 =
(-vx + i * vy) * (x^2 - y^2 + i * (2 * x * y)) / (x^2 + y^2) =
((-vx * (x^2 - y^2) - 2 * vy * x * y) + i * (vy * (x^2 - y^2) - 2 * vx * x * y)) / (x^2 + y^2)
*/

function getCollisionSpeed (x, y, vx, vy) {
	var a = x * x - y * y,
		b = pythagoras(x, y),
		c = 2 * x * y;
	return {
		vx: (-vx * a - vy * c) / b,
		vy: (vy * a - vx * c) / b
	};
}

//utility functions to manage fullscreen
function isFullscreen () {
	return document.fullscreenElement ||
		document.mozFullScreenElement ||
		document.webkitFullscreenElement ||
		document.msFullscreenElement ||
		document.webkitIsFullScreen;
}

function toggleFullscreen () {
	var el;
	if (isFullscreen()) {
		if (document.exitFullscreen) {
			document.exitFullscreen();
		} else if (document.webkitExitFullscreen) {
			document.webkitExitFullscreen();
		} else if (document.mozCancelFullScreen) {
			document.mozCancelFullScreen();
		} else if (document.msExitFullscreen) {
			document.msExitFullscreen();
		}
	} else {
		el = document.documentElement;
		if (el.requestFullscreen) {
			el.requestFullscreen();
		} else if (el.webkitRequestFullscreen) {
			el.webkitRequestFullscreen();
		} else if (el.mozRequestFullScreen) {
			el.mozRequestFullScreen();
		} else if (el.msRequestFullscreen) {
			el.msRequestFullscreen();
		}
	}
}

function scrollTop () {
	window.scrollTo(0, 0);
}

function formatHtml (txt) {
	return '<p>' + txt.replace(/\n/g, '</p><p>') + '</p>';
}

/*
C. Initialising
This part contains the code to iniatilize the game, i.e. that part of the game
that doesn't use the canvas.
*/
function initVars () {
	starCount = getPersistent('stars') || 0;
	isMuted = !!getPersistent('muted');
}

function getRecords () {
	return JSON.parse(getPersistent('records') || '{}');
}

function playGame (type) {
	initSound();
	initCanvas(function () {
		play(function () {
			var msg = ['Game over.'], msg2, records = getRecords();
			if (roundNumber > (records[gameType] || 0)) {
				records[gameType] = roundNumber;
				storePersistent('records', JSON.stringify(records));
				msg.push('New record!');
			}
			if (
				(document.monetization && document.monetization.state === 'started') ||
				location.search === '?monetization-cheater'
			) {
				starCount += 5;
				storePersistent('stars', starCount);
				msg2 = ['As a Web Monetization', 'supporter, you get', '5 extra stars!'];
			}
			drawLost(msg, msg2);
			playSound('end');
		}, type);
	});
}

function showIntro (html, label, callback, i, force) {
	var button;

	function clickHander () {
		storePersistent('intro', i + 1);
		button.removeEventListener('click', clickHander);
		callback();
	}

	if (!force && (getPersistent('intro') || 0) > i) {
		callback();
		return;
	}

	document.body.innerHTML = '<div id="intro">' + html + '<p><button id="button">' + label + '</button></p></div>';
	button = document.getElementById('button');
	button.addEventListener('click', clickHander);
	scrollTop();
}

function showFirstIntro (callback, force) {
	var introTxt = 'Ever since you read <i>The War of the Worlds</i>, a documentary on the first invasion from Mars, you feared—like its author—that one day the Martians might come back.\nEven though your friends laughed a great deal about it, you decided to built a bullet from the remains of their artillery. It’s just one bullet, which will hardly be enough, but you hope that when the Martians do come back, you can collect material for more bullets before they are able to land.\nAnd then it happens: One night you are awakened by a bright light, and you see Martian spaceships decending. Now it is your chance to prove to your friends that you were right. But it’s more than that: The fate of all human beeings might depend on whether you succeed to destroy the Martian spaceships before they can land.\nGood luck!'; //TODO
	showIntro('<h1>The Martians are Back!</h1>' + formatHtml(introTxt), 'Start', callback, 0, force);
}

function showIntroBeforeLevel (type, intro) {
	var html = [ //TODO
		'You don’t know how the first attack was defeated, after the first Matian spaceship reached the ground. And you don’t have the time to think about it, for the second attack is already coming.\nAnd this time the attack is even more dangerous: The clouds won’t do any harm to your bullets, just reflect them randomly. But beware of the deadly Heat-Rays. They won’t do any real harm when they reach the earth, but they will destroy your bullets when you hit them.\nThere are also some magical items that will send all your bullets <b>back</b> the way they came.',
		'It seems this night you won’t get any more sleep.\nNow the Martians are trying a new formation to attack.',
		'As if Martian spaceships weren’t enough, there are even more special items coming down along with them. There are obstacles, which will block your bullets, but there are also bombs, which will destroy anything—fortunately except your bullets—around them when your bullets trigger an explosion.\nAnd there are also some other magical items that allow your bullets to pass through the outer borders.',
		'In the twilight of the night you see the next attack wave coming.\n“What’s this?”, you wonder. “The Martians no longer attack in an ordered formation, but with spaceships of different sizes, coming down from everywhere!”'
	];
	if (intro) {
		showIntro(formatHtml(html[intro - 1]), 'Start game', function () {
			playGame(type);
		}, intro);
	} else {
		playGame(type);
	}
}

function showOutro (callback, intro, force) {
	var outro = 'Again a Martian spaceship landed on earth, because you didn’t succeed to shoot it in time. You gasp as the spaceship slowly opens, “That’s the end!”, you think. You scream loudly—and suddenly awake.\n“Did I sleep?”, you think. And then you realize that the attack from Mars wasn’t real, it was just a dream.\nYou look up into the sky, a peaceful sky without spaceships attacking you.\nBut what’s that, up there, to far away to see properly? It could be something you just imagine, but you decide that it’s better to be on the safe side. So you keep practicing to defend earth from Martian spaceships. You never know when they come back.'; //TODO
	showIntro(formatHtml(outro), 'Continue playing', callback, intro, force);
}

function buildMenuHtml () {
	function makeButton (level, enabled, record) {
		return '<p><button ' + (enabled ? ('data-type="' + level.type + '"') : 'disabled') +
			(level.intro ? ' data-intro="' + level.intro + '"' : '') + '>' +
			level.label + (record ? '<br>Your record: ' + record : '') +
			'</button></p>';
	}

	function getUnlockText (level, stars, prev) {
		var html = ['<p>'];
		if (stars || prev) {
			html.push('You collected ' + stars + ' star' + (Number(stars) === 1 ? '' : 's') + ' so far.');
		}
		if (level) {
			html.push(' ');
			if (!prev && stars < level.stars) {
				html.push('Finish the previous level and collect ' + level.stars + ' stars');
			} else if (!prev) {
				html.push('Finish the previous level');
			} else {
				html.push('Collect ' + level.stars + ' stars');
			}
			html.push(' to ');
			if (level.type === 'outro') {
				html.push('read how the story ends.');
			} else {
				html.push('unlock the next level.');
			}
		}
		html.push('</p>');
		return html.join('');
	}

	var levels = [
		{type: 'hex-0', label: 'First Attack'},
		{type: 'hex-1', label: 'Second Attack', stars: 10, intro: 1},
		{type: 'square-0', label: 'Third Attack', stars: 20, intro: 2},
		{type: 'square-2', label: 'Fourth Attack', stars: 30, intro: 3},
		{type: 'chaos-2', label: 'Fifth Attack', stars: 40, intro: 4},
		{type: 'outro', label: 'The End', stars: 50, intro: 5}
	], html = [], i, level, enabled = true, record, records = getRecords();

	if (getPersistent('state')) {
		if (menuShownFirstTime) {
			html.push('<p>Welcome back! Do you want to resume your last game?</p>');
		}
		html.push(
			makeButton({type: 'restore', label: menuShownFirstTime ? 'Resume Last Game' : 'Continue Current Game'}, true)
		);
	}
	html.push('<p><button data-type="fullscreen">Toggle Fullscreen</button></p>');
	html.push('<div class="border">');
	html.push('<p><button data-type="intro">Show Intro Again</button></p>');
	for (i = 0; i < levels.length; i++) {
		level = levels[i];
		if (enabled && (level.stars || 0) > starCount) {
			enabled = false;
			html.push(getUnlockText(level, starCount, true));
		}
		record = records[level.type];
		html.push(makeButton(level, enabled, record));
		if (enabled && !record && level.type !== 'outro') {
			enabled = false;
			html.push(getUnlockText(levels[i + 1], starCount, false));
		}
	}
	if (enabled) {
		html.push(getUnlockText(false, starCount));
	}
	html.push('</div>');

	return '<div id="menu">' + html.join('') + '</div>';
}

function initMenu () {
	var menu;

	function clickHander (e) {
		var type = e.target.dataset.type, intro = e.target.dataset.intro;
		if (type === 'fullscreen') {
			toggleFullscreen();
		} else if (type) {
			menu.removeEventListener('click', clickHander);
			if (type === 'intro') {
				showFirstIntro(initMenu, true);
			} else if (type === 'outro') {
				showOutro(initMenu, intro, true);
			} else {
				showIntroBeforeLevel(type, intro);
			}
		}
	}

	document.body.innerHTML = buildMenuHtml();
	menu = document.getElementById('menu');
	menu.addEventListener('click', clickHander);
	menuShownFirstTime = false;
	scrollTop();
}

/*
D. Sound
This part contains all functions for sound.
*/
function initSound () {
	if (audio) {
		return;
	}
	try {
		audio = new AudioContext();
	} catch (e) {
	}
}

//based on https://github.com/foumart/JS.13kGames/blob/master/lib/SoundFX.js
//http://www.foumartgames.com/dev/js13kGames/js_libraries/SoundFXGenerator/
function generateSound (freq, incr, delay, times, vol, type) {
	var i = 0, osc, g, interval;

	function stop () {
		clearInterval(interval);
		osc.stop();
		osc.disconnect();
		g.disconnect();
	}

	function internalPlay () {
		osc.frequency.value = freq + incr * i;
		g.gain.value = (1 - (i / times)) * vol;
		i++;
		if (i > times) {
			setTimeout(stop, delay);
		}
	}

	osc = audio.createOscillator();
	g = audio.createGain();
	osc.connect(g);
	g.connect(audio.destination);

	osc.frequency.value = freq;
	osc.type = ['square', 'sawtooth', 'triangle', 'sine'][type || 0];
	g.gain.value = 0;
	osc.start();
	interval = setInterval(internalPlay, delay);
}

function playSound (type) {
	if (isMuted || !audio) {
		return;
	}
	switch (type) {
	case 'start':
		generateSound(200, -30, 5, 10, 0.5, 2);
		break;
	case 'wall':
	case 'obstacle':
		generateSound(100, -30, 15, 10, 0.5, 2);
		break;
	case 'item':
		generateSound(100, -10, 15, 15, 1, 2);
		break;
	case 'item-0':
		generateSound(100, -10, 10, 25, 0.5);
		generateSound(125, -5, 20, 45, 0.1, 1);
		generateSound(40, 2, 20, 20, 1, 2);
		generateSound(200, -4, 10, 100, 0.25, 2);
		break;
	case 'ball':
		generateSound(150, 30, 15, 20, 0.5, 2);
		break;
	case 'star':
		generateSound(510, 0, 15, 20, 0.05);
		setTimeout(function () {
			generateSound(2600, 1, 10, 50, 0.1);
		}, 80);
		break;
	case 'back':
		generateSound(800, -40, 30, 15, 0.5, 2);
		break;
	case 'die':
	case 'explode':
		generateSound(100, -10, 10, 25, 0.75);
		generateSound(125, -5, 20, 45, 0.2, 1);
		generateSound(40, 2, 20, 20, 1, 2);
		generateSound(200, -4, 10, 100, 0.5, 2);
		break;
	case 'random':
		generateSound(500, -200, 10, 10, 0.25, 1);
		break;
	case 'toggle':
		generateSound(750, -30, 5, 20, 0.25);
		setTimeout(function () {
			generateSound(150, 30, 5, 20, 0.25);
		}, 100);
		break;
	case 'end':
		generateSound(800, -40, 25, 20, 0.5, 2);
		break;
	case 'speed':
		generateSound(150, 30, 2, 20, 0.5, 2);
		setTimeout(function () {
			generateSound(150, 30, 2, 20, 0.5, 2);
		}, 150);
	}
}

/*
E. Drawing
This part contains all functions related to canvas and drawing.
*/
function loadImage (url, w, h, callback) {
	var img = new Image(w, h), canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	img.onload = function () {
		canvas.getContext('2d').drawImage(img, 0, 0, w, h);
		callback(canvas);
	};
	img.src = url;
}

//create and init canvas, load icons
function initCanvas (callback) {
	var canvas;

	//check whether the event indicates we are on a "button", and if so which one
	function getAction (e) {
		var x, y;
		x = (e.clientX - e.target.offsetLeft) / e.target.clientWidth * TOTAL_WIDTH;
		y = (e.clientY - e.target.offsetTop) / e.target.clientHeight * TOTAL_HEIGHT;
		if (y < PANEL_HEIGHT) {
			if (x < PANEL_HEIGHT) {
				return isRunning ? {
					title: 'Speed up [Space]',
					action: 'speed'
				} : {
					title: 'Back to menu [Esc]',
					action: 'menu'
				};
			} else if (x > TOTAL_WIDTH - PANEL_HEIGHT) {
				return isMuted ? {
					title: 'Unmute [M]',
					action: 'togglemute'
				} : {
					title: 'Mute [M]',
					action: 'togglemute'
				};
			}
		}
	}

	function handleEvent (action) {
		switch (action) {
		case 'speed':
			speedUp(1.7);
			break;
		case 'menu':
			if (disableEject) {
				disableEject();
			}
			window.removeEventListener('resize', resize);
			canvas.removeEventListener('mousemove', mousemoveHandler);
			canvas.removeEventListener('click', clickHander);
			window.removeEventListener('keydown', keyDownHandler);
			initMenu();
			break;
		case 'togglemute':
			isMuted = !isMuted;
			if (isMuted) {
				storePersistent('muted', 1);
			} else {
				clearPersistent('muted');
			}
			if (!isRunning) {
				drawPanel();
			}
		}
	}

	function mousemoveHandler (e) {
		var action = getAction(e);
		if (action) {
			canvas.title = action.title;
			canvas.style.cursor = 'pointer';
		} else {
			canvas.title = '';
			canvas.style.cursor = '';
		}
	}

	function clickHander (e) {
		var action = getAction(e) || {};
		handleEvent(action.action);
	}

	function keyDownHandler (e) {
		switch (e.key || e.keyCode) {
		case 27:
		case 'Esc': //old deprecated value
		case 'Escape':
			if (!isRunning) {
				handleEvent('menu');
			}
			e.preventDefault();
			break;
		case 32:
		case 'Spacebar': //old deprecated value
		case ' ':
			if (isRunning) {
				handleEvent('speed');
			}
			e.preventDefault();
			break;
		case 77:
		case 'm':
			handleEvent('togglemute');
			e.preventDefault();
		}
	}

	document.body.innerHTML = '<canvas moz-opaque></canvas>';
	canvas = document.getElementsByTagName('canvas')[0];
	canvas.width = TOTAL_WIDTH;
	canvas.height = TOTAL_HEIGHT;
	ctx = canvas.getContext('2d', {alpha: false});
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.strokeStyle = BALL_COLOR;
	ctx.lineWidth = 2;
	ctx.mozDash = [5];
	ctx.webkitLineDash = [5];
	if (ctx.setLineDash) {
		ctx.setLineDash([5]);
	}
	backgroundGradient = ctx.createLinearGradient(0, PANEL_HEIGHT, 0, TOTAL_HEIGHT);
	backgroundGradient.addColorStop(0, BACKGROUND_COLORS[0]);
	backgroundGradient.addColorStop(1 - GRID / (TOTAL_HEIGHT - PANEL_HEIGHT), BACKGROUND_COLORS[1]);
	backgroundGradient.addColorStop(1 - (GRID - 1) / (TOTAL_HEIGHT - PANEL_HEIGHT), BACKGROUND_COLORS[2]);
	backgroundGradient.addColorStop(1, BACKGROUND_COLORS[2]);

	resize();
	window.addEventListener('resize', resize);

	canvas.addEventListener('mousemove', mousemoveHandler);
	canvas.addEventListener('click', clickHander);
	window.addEventListener('keydown', keyDownHandler);

	if (icons) {
		callback();
		return;
	}

	loadImage(SVG ? 'data:image/svg+xml;base64,' + btoa(SVG) : 'icons.svg', GRID, 12 * GRID, function (canvas) {
		icons = canvas;
		callback();
	});
}

//scale canvas to fit on screen
function resize () {
	var docEl = document.documentElement, scale, style;
	scale = Math.min(isFullscreen() ? 2 : 1, docEl.clientWidth / TOTAL_WIDTH, docEl.clientHeight / TOTAL_HEIGHT);
	style = ctx.canvas.style;
	style.width = TOTAL_WIDTH * scale + 'px';
	style.height = TOTAL_HEIGHT * scale + 'px';
}

function drawText (text, x, y, w, h) {
	ctx.font = 'bold ' + (h / 2) + 'px sans-serif';
	ctx.fillText(text, x, y, w);
}

function getColors (n) {
	var angle = ((START_COLOR - n / 50 * 360) % 360 + 360) % 360;
	return {
		bg: 'hsl(' + angle + ',100%,50%)',
		fg: Math.abs(angle - 110) <= 90 ? 'black' : 'white'
	};
}

function drawIcon (n, x, y, s) {
	ctx.drawImage(icons, 0, n * GRID, GRID, GRID, x - s / 2, y - s / 2, s, s);
}

function drawPanel () {
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, TOTAL_WIDTH, PANEL_HEIGHT);
	ctx.fillStyle = 'white';
	drawText((livingBallCount || ballCount) + '●', TOTAL_WIDTH * 2 / 7, PANEL_HEIGHT * 3 / 5,
		TOTAL_WIDTH * 3 / 14, PANEL_HEIGHT * 3 / 5);
	drawText(roundNumber, TOTAL_WIDTH / 2, PANEL_HEIGHT / 2, TOTAL_WIDTH * 3 / 14, PANEL_HEIGHT);
	drawText(starCount + '★', TOTAL_WIDTH * 5 / 7, PANEL_HEIGHT * 3 / 5,
		TOTAL_WIDTH * 3 / 14, PANEL_HEIGHT * 3 / 5);
	if (isRunning) {
		drawIcon(9, PANEL_HEIGHT / 2, PANEL_HEIGHT / 2, PANEL_HEIGHT);
	} else {
		drawIcon(8, PANEL_HEIGHT / 2, PANEL_HEIGHT / 2, PANEL_HEIGHT);
	}
	if (isMuted) {
		drawIcon(11, TOTAL_WIDTH - PANEL_HEIGHT / 2, PANEL_HEIGHT / 2, PANEL_HEIGHT);
	} else {
		drawIcon(10, TOTAL_WIDTH - PANEL_HEIGHT / 2, PANEL_HEIGHT / 2, PANEL_HEIGHT);
	}
}

//draw the current scene
function draw () {
	ctx.fillStyle = backgroundGradient;
	ctx.fillRect(0, PANEL_HEIGHT, TOTAL_WIDTH, TOTAL_HEIGHT - PANEL_HEIGHT);
	allItems.forEach(function (item) {
		var colors;
		if (item.n > 0) {
			colors = getColors(item.n);
			ctx.fillStyle = colors.bg;
			ctx.beginPath();
			ctx.arc(SMALL_R + item.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - item.y, item.r, 0, 2 * Math.PI);
			ctx.fill();
			ctx.fillStyle = colors.fg;
			drawText(item.n, SMALL_R + item.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - item.y, 2 * item.r, 2 * item.r);
		} else if (item.n < 0) {
			drawIcon(-item.n - 1, SMALL_R + item.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - item.y, GRID * item.r / LARGE_R);
		}
	});
	animations.forEach(function (animation) {
		var state = (animation.dur - animation.t) / animation.dur, m;
		switch (animation.type) {
		case 'remove-item':
			ctx.fillStyle = 'hsla(' + START_COLOR + ',' + (100 * state).toFixed() + '%,50%,' + state.toFixed(2) + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y,
				animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		case 'die':
			m = state < 2 / 3 ? 3 * state / 2 : 3 * (1 - state);
			ctx.fillStyle = 'hsla(60,100%,' + (50 + 50 * m).toFixed() + '%,' + m.toFixed(2) + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y,
				animation.r - animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		case 'explode':
			ctx.fillStyle = 'rgba(255,255,255,' + state.toFixed(2) + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y,
				animation.r - animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		case 'hit':
			ctx.fillStyle = 'rgba(255,255,255,' + (state / 2).toFixed(2) + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y,
				animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		}
	});
	ctx.fillStyle = BALL_COLOR;
	allBalls.forEach(function (ball) {
		ctx.beginPath();
		ctx.arc(SMALL_R + ball.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - ball.y, SMALL_R, 0, 2 * Math.PI);
		ctx.fill();
		if (ball.noWall) {
			ctx.beginPath();
			ctx.arc(SMALL_R + ball.x + TOTAL_WIDTH, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - ball.y, SMALL_R, 0, 2 * Math.PI);
			ctx.fill();
		}
	});
	drawPanel();
}

function drawNumberBalls (n, x) {
	ctx.fillStyle = 'black';
	drawText(n, SMALL_R + x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT, 2 * SMALL_R, 2 * SMALL_R);
}

function drawLost (texts, texts2) {
	var i, start;
	ctx.fillStyle = 'rgba(0,0,0,0.7)';
	ctx.fillRect(0, PANEL_HEIGHT, TOTAL_WIDTH, TOTAL_HEIGHT - PANEL_HEIGHT);
	ctx.fillStyle = 'white';
	start = TOTAL_HEIGHT / 2 + PANEL_HEIGHT / 2 - (texts.length - 1) / 2 * 1.5 * GRID;
	if (texts2) {
		start -= GRID;
	}
	for (i = 0; i < texts.length; i++) {
		drawText(texts[i], TOTAL_WIDTH / 2, start + 1.5 * GRID * i, TOTAL_WIDTH, 1.5 * GRID);
	}
	if (texts2) {
		start = TOTAL_HEIGHT / 2 + PANEL_HEIGHT / 2 + 0.75 * GRID * texts.length + GRID;
		for (i = 0; i < texts2.length; i++) {
			drawText(texts2[i], TOTAL_WIDTH / 2, start + GRID * i, TOTAL_WIDTH, GRID);
		}
	}
}

function drawHelp () {
	ctx.fillStyle = BALL_COLOR;
	ctx.beginPath();
	ctx.moveTo(TOTAL_WIDTH / 3 - GRID, 2 * TOTAL_HEIGHT / 3);
	ctx.lineTo(TOTAL_WIDTH / 2 - GRID, 3 * TOTAL_HEIGHT / 4);
	ctx.lineTo(TOTAL_WIDTH / 2 - GRID, 3 * TOTAL_HEIGHT / 4 - 15);
	ctx.moveTo(TOTAL_WIDTH / 2 - GRID, 3 * TOTAL_HEIGHT / 4);
	ctx.lineTo(TOTAL_WIDTH / 2 - 15 - GRID, 3 * TOTAL_HEIGHT / 4);
	ctx.stroke();
	ctx.textAlign = 'start';
	drawText('Drag to shoot', TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4, TOTAL_WIDTH / 2, GRID / 2);
	drawText('(or use your keyboard:', TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4 + GRID / 2, TOTAL_WIDTH / 2, GRID / 2);
	drawText('left and right cursor', TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4 + GRID, TOTAL_WIDTH / 2, GRID / 2);
	drawText('to aim, Enter to shoot)', TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4 + 1.5 * GRID, TOTAL_WIDTH / 2, GRID / 2);
	ctx.textAlign = 'center';
}

/*
F. Round management
This part contains all functions for managing rounds, starting and ending them.
*/

//Eject
function waitEject (ballX, callback, v) {
	var mode, startX, startY, keyX, keyY, style;

	function getSpeedFromDrag (x, y) {
		var d, f;
		if (ballX === 0 && x > 0) {
			return;
		}
		if (ballX === INNER_WIDTH && x < 0) {
			return;
		}
		d = Math.sqrt(pythagoras(x, y));
		if (y > 0 && d >= 3) {
			f = EJECT_SPEED / d;
			return {vx: -x * f, vy: y * f};
		}
	}

	function mousedownHandler (e) {
		if (mode === 't') {
			return;
		}
		startX = e.screenX;
		startY = e.screenY;
		mode = 'm';
		e.preventDefault();
	}

	function mousemoveHandler (e) {
		if (mode !== 'm') {
			return;
		}
		e.preventDefault();
		moveHandler(e.screenX, e.screenY);
	}

	function mouseupHandler (e) {
		if (mode !== 'm') {
			return;
		}
		e.preventDefault();
		upHandler(e.screenX, e.screenY);
	}

	function touchstartHandler (e) {
		if (e.touches.length !== 1) {
			mode = '';
			return;
		}
		startX = e.touches[0].screenX;
		startY = e.touches[0].screenY;
		mode = 't';
	}

	function touchmoveHandler (e) {
		if (e.touches.length !== 1) {
			mode = '';
			return;
		}
		moveHandler(e.touches[0].screenX, e.touches[0].screenY);
	}

	function touchendHandler (e) {
		if (mode !== 't' || e.changedTouches.length !== 1) {
			return;
		}
		upHandler(e.changedTouches[0].screenX, e.changedTouches[0].screenY);
	}

	function touchcancelHandler () {
		mode = '';
	}

	function moveHandler (x, y) {
		var v, l, t;
		v = getSpeedFromDrag(x - startX, y - startY);
		draw();
		drawNumberBalls(ballCount, ballX);
		if (v) {
			l = (SMALL_R + 5) / Math.sqrt(pythagoras(v.vx, v.vy));
			t = getNextCollision(ballX, 0, v.vx, v.vy).t;
			ctx.beginPath();
			ctx.moveTo(SMALL_R + ballX + v.vx * l, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - v.vy * l);
			ctx.lineTo(SMALL_R + ballX + v.vx * t, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - v.vy * t);
			ctx.stroke();
		}
	}

	function upHandler (x, y) {
		var v;
		mode = '';
		v = getSpeedFromDrag(x - startX, y - startY);
		draw();
		if (v) {
			disableEject();
			callback(v.vx, v.vy);
		} else {
			drawNumberBalls(ballCount, ballX);
		}
	}

	function keyHandler (e) {
		var dir = 1;
		switch (e.key || e.keyCode) {
		case 13:
		case 'Enter':
			if (mode === 'k') {
				e.preventDefault();
				upHandler(keyX, keyY);
			}
			break;
		case 37:
		case 'Left': //old deprecated value
		case 'ArrowLeft':
			dir = -1;
			/*falls through*/
		case 39:
		case 'Right': //old deprecated value
		case 'ArrowRight':
			if (mode !== 'k') {
				startX = TOTAL_WIDTH / 2;
				startY = 0;
				keyX = startX;
				keyY = startY + 10;
				mode = 'k';
			}
			//You can't precisely aim with the mouse, so you can't with keyboard either
			keyX -= dir * (2 + Math.floor(2 * Math.random()));
			keyY += Math.floor(2 * Math.random());
			e.preventDefault();
			moveHandler(keyX, keyY);
		}
	}

	if (v) {
		callback(v.vx, v.vy);
		return;
	}

	style = document.documentElement.style;
	style.cursor = 'crosshair';
	/*I can't really test iOS, so just try to fight with it*/
	style.overscrollBehavior = 'none';
	style.position = 'fixed';
	style.width = '100%';

	window.addEventListener('mousedown', mousedownHandler);
	window.addEventListener('mousemove', mousemoveHandler);
	window.addEventListener('mouseup', mouseupHandler);
	window.addEventListener('touchstart', touchstartHandler);
	window.addEventListener('touchmove', touchmoveHandler);
	window.addEventListener('touchend', touchendHandler);
	window.addEventListener('touchcancel', touchcancelHandler);
	window.addEventListener('keydown', keyHandler);
	disableEject = function () {
		style.cursor = '';
		style.overscrollBehavior = '';
		style.position = '';
		style.width = '';
		window.removeEventListener('mousedown', mousedownHandler);
		window.removeEventListener('mousemove', mousemoveHandler);
		window.removeEventListener('mouseup', mouseupHandler);
		window.removeEventListener('touchstart', touchstartHandler);
		window.removeEventListener('touchmove', touchmoveHandler);
		window.removeEventListener('touchend', touchendHandler);
		window.removeEventListener('touchcancel', touchcancelHandler);
		window.removeEventListener('keydown', keyHandler);
		disableEject = false;
	};
	drawNumberBalls(ballCount, ballX);
	if (!getPersistent('hint')) {
		drawHelp();
		storePersistent('hint', 1);
	}
}

function addNewItems () {
	var n, a, i, type = gameType.split('-');

	function getArray (n) {
		var a = [], p;
		p = Math.min(0.4, Math.sqrt(roundNumber / 100));
		if (roundNumber === 1) {
			p *= 2; //two rows, so double
		}
		a.push(Math.ceil((Math.floor(Math.random() * 3) / 2 + 1) * ballCount));
		if (roundNumber === 1) {
			a.push(2);
		}
		if (Math.random() < p) {
			a.push(ballCount);
		}
		if (Math.random() < p) {
			a.push(Math.ceil((Math.floor(Math.random() * 2) / 2 + 1) * ballCount));
		}
		if (Math.random() < p) {
			a.push(Math.ceil(1.5 * ballCount));
		}
		if (Math.random() < p) {
			a.push(Math.ceil((Math.floor(Math.random() * 2) / 2 + 1.5) * ballCount));
		}
		if (Math.random() < p) {
			a.push(2 * ballCount);
		}
		if (type !== 'hex' && Math.random() < p) {
			a.push(2 * ballCount);
		}
		if (type === 'choas' && Math.random() < 2 * p) {
			a.push(2 * ballCount);
		}
		p = 0.9 * Math.pow(2 / 3, ballCount / 18);
		if (roundNumber === 1) {
			a.push(-1);
		}
		if (Math.random() < p) {
			a.push(-1);
		}
		if (type[1] > 0 && Math.random() < (1 - p) / 3) {
			a.push(-4);
		}
		if (a.length < n) {
			p = starCount < 5 ? 0.25 : 0.15;
			if (roundNumber === 1) {
				a.push(-2);
			}
			if (Math.random() < p) {
				a.push(-2);
			} else if (type[1] > 0) {
				if (Math.random() < 0.3) {
					a.push([-3, -5, -6, -7, -8][Math.floor(Math.random() * (3 * type[1] - 1))]);
				}
				if (Math.random() < 0.3) {
					a.push([-3, -5, -6, -7, -8][Math.floor(Math.random() * (3 * type[1] - 1))]);
				}
			}
		}
		while (a.length < n) {
			a.push(0);
		}
		return mix(a);
	}

	function mix (a) {
		var i, out = [];
		while (a.length) {
			i = Math.floor(Math.random() * a.length);
			out.push(a.splice(i, 1)[0]);
		}
		return out;
	}

	function doLine (h, a) {
		var x, start, d;
		if (type[0] === 'hex') {
			d = 2 * GRID / Math.sqrt(3);
			start = (roundNumber + h) % 2 ? d : d / 2;
		} else {
			d = GRID;
			start = GRID / 2;
		}
		for (x = start; x <= TOTAL_WIDTH - LARGE_R; x += d) {
			allItems.push({
				x: x - SMALL_R,
				y: INNER_HEIGHT - GRID / 2 - h * GRID + SMALL_R,
				r: LARGE_R,
				n: a.pop()
			});
		}
	}

	function doChaos (c, h, a) {
		var i, j, n, r, x, y, tries, good;
		for (i = 0; i < c; i++) {
			n = a.pop();
			if (n === 0) {
				continue;
			}
			for (tries = 0; tries < 50; tries++) {
				r = LARGE_R * [0.75, 0.75, 1, 1, 1, 1.2][Math.floor(Math.random() * 6)],
				x = r + (TOTAL_WIDTH - 2 * r) * Math.random() - SMALL_R;
				y = INNER_HEIGHT - r - Math.random() * 2 * GRID + SMALL_R - h;
				good = true;
				for (j = 0; j < allItems.length; j++) {
					if (pythagoras(x - allItems[j].x, y - allItems[j].y) < (r + allItems[j].r) * (r + allItems[j].r)) {
						good = false;
						break;
					}
				}
				if (good) {
					allItems.push({
						x: x,
						y: y,
						r: r,
						n: n
					});
					break;
				}
			}
		}
	}

	if (roundNumber === 1) {
		n = 2 * WIDTH;
		if (type[0] === 'hex') {
			n -= 3;
		}
		a = getArray(n);
		if (type[0] === 'chaos') {
			doChaos(n, 0, a);
		} else {
			for (i = 1; i < 3; i++) {
				doLine(i, a);
			}
		}
	} else {
		if (allItems.length === 0) {
			//all cleared -> grant a row with stars
			a = [];
			for (i = 0; i < WIDTH; i++) {
				a.push(-2);
			}
			if (type[0] === 'chaos') {
				doChaos(WIDTH, 2 * GRID, a);
			} else {
				doLine(2, a);
			}
		}
		n = WIDTH;
		if (type[0] === 'hex') {
			n -= roundNumber % 2 ? 1 : 2;
		} else if (type[0] === 'chaos') {
			n = Math.ceil(1.5 * n);
		}
		a = getArray(n);
		if (type[0] === 'chaos') {
			doChaos(n, 0, a);
		} else {
			doLine(1, a);
		}
	}
}

function storeState (state) {
	if (state) {
		storePersistent('state', JSON.stringify(state));
	} else {
		clearPersistent('state');
	}
}

function restoreState () {
	var savedState = JSON.parse(getPersistent('state'));
	gameType = savedState.gameType;
	ballCount = savedState.ballCount;
	roundNumber = savedState.roundNumber;
	allItems = savedState.allItems;
	return {
		startX: savedState.startX,
		v: savedState.v
	};
}

function initGame (type) {
	gameType = type;
	ballCount = 1;
	roundNumber = 1;
	allItems = [];
	addNewItems();
}

function initRound (n, startX) {
	var i;
	endX = undefined;
	noWalls = false;
	animations = [];
	allBalls = [];
	livingBallCount = n;
	for (i = 0; i < n; i++) {
		allBalls.push({
			x: startX,
			y: 0,
			vx: 0,
			vy: 0,
			t: (i + 0.1) * EJECT_TIME,
			action: 'start'
		});
	}
}

function exitRound () {
	var lost = ballCount === 0 || endX === undefined;
	//move all items down one row
	allItems.forEach(function (item) {
		item.y -= GRID;
		if (item.y < GRID - SMALL_R + item.r) {
			if (item.n <= 0) {
				item.n = 0;
			} else {
				lost = true;
			}
		}
	});
	//remove obsolete items
	allItems = allItems.filter(function (item) {
		return item.n !== 0;
	});
	if (!lost) {
		roundNumber++;
		addNewItems();
	}
	return !lost;
}

function doRound (n, startX, callback, v) {
	initRound(n, startX);
	draw();
	storeState(roundNumber === 1 ? null : {
		gameType: gameType,
		ballCount: ballCount,
		roundNumber: roundNumber,
		allItems: allItems,
		startX: startX
	});
	waitEject(startX, function (vx, vy) {
		storeState({
			gameType: gameType,
			ballCount: ballCount,
			roundNumber: roundNumber,
			allItems: allItems,
			startX: startX,
			v: {vx: vx, vy: vy}
		});
		run(vx, vy, function (endX) {
			storePersistent('stars', starCount);
			callback(exitRound(), endX);
		});
	}, v);
}

function play (callback, type) {
	var startX, restore;
	function nextRound (running, endX) {
		startX = endX;
		if (running) {
			doRound(ballCount, startX, nextRound);
		} else {
			animations = [];
			allBalls = [];
			draw();
			storeState(null);
			callback();
		}
	}

	if (type === 'restore') {
		restore = restoreState();
		startX = restore.startX;
	} else {
		initGame(type);
		startX = INNER_WIDTH / 2;
	}
	doRound(ballCount, startX, nextRound, restore && restore.v);
}

/*
G. Game loop
This part contains all functions for the game loop.
*/

function speedUp (factor) {
	playSound('speed');
	startVx *= factor;
	startVy *= factor;
	allBalls.forEach(function (ball) {
		ball.vx *= factor;
		ball.vy *= factor;
		ball.t /= factor;
	});
}

/*
We are at (x, y) and move with speed (vx, vy). When and where is the next collision?
*/
function getNextCollision (x, y, vx, vy, noWall) {
	var action = '', time = Infinity, t;
	if (noWall && vx < 0) {
		//move to the side where the collision will happen
		x += TOTAL_WIDTH;
	}
	if (vy > 0) {
		action = 'top';
		time = (INNER_HEIGHT - y) / vy;
	} else if (vy < 0) {
		action = 'bottom';
		time = -y / vy;
	}
	if (vx !== 0) {
		t = vx > 0 ? (INNER_WIDTH - x) / vx : -x / vx;
		if (t < time) {
			action = 'side';
			time = t;
		} else if (t === time && action === 'top') {
			action = 'corner';
		}
	}
	allItems.forEach(function (item, index) {
		if (item.n === 0) {
			return;
		}
		t = getCollisionTime(x - item.x, y - item.y, vx, vy, item.r + SMALL_R);
		if (t < time) {
			time = t;
			action = index;
		}
		if (noWall) { //again with item on other side
			t = getCollisionTime(x - item.x + (vx < 0 ? -TOTAL_WIDTH : TOTAL_WIDTH), y - item.y, vx, vy, item.r + SMALL_R);
			if (t < time) {
				time = t;
				action = index;
			}
		}
	});
	return {
		t: time,
		action: action
	};
}

function doStep (t) {
	animations.forEach(function (animation) {
		animation.t += t;
	});
	animations = animations.filter(function (animation) {
		return animation.t <= animation.dur;
	});
	allBalls.forEach(function (ball) {
		var item, collision, r;
		ball.x += t * ball.vx;
		ball.y += t * ball.vy;
		ball.t -= t;
		if (ball.noWall) {
			if (ball.x <= -2 * SMALL_R) {
				ball.x += TOTAL_WIDTH;
				ball.noWall = false;
			} else if (ball.x >= 0) {
				ball.noWall = false;
			}
		}
		if (ball.t > 0) {
			return;
		}
		switch (ball.action) {
		case 'start':
			ball.vx = startVx;
			ball.vy = startVy;
			playSound('start');
			break;
		case 'end':
			ball.x = endX; //fix rounding errors
			ball.vx = 0;
			ball.t = Infinity;
			livingBallCount--;
			return;
		case 'top':
			ball.vy *= -1;
			playSound('wall');
			break;
		case 'corner':
			ball.vy *= -1;
			playSound('wall');
			/*falls through*/
		case 'side':
			if (Math.abs(ball.vy) * 2000 < GRID) {
				//we are moving almost horizontally
				ball.vy += GRID / 6000 * (ball.vy > 0 ? 1 : -1);
			}
			if (noWalls) {
				ball.noWall = true;
				if (ball.x > INNER_WIDTH / 2) {
					ball.x -= TOTAL_WIDTH;
				}
			} else {
				ball.vx *= -1;
				if (ball.action !== 'corner') {
					playSound('wall');
				}
			}
			break;
		case 'bottom':
			ball.y = 0; //fix rounding errors
			ball.vy = 0;
			if (endX === undefined || ball.x === endX) {
				//we ended while passing through the wall, move to corner
				if (ball.noWall) {
					if (ball.x < -SMALL_R) {
						ball.x = INNER_WIDTH;
					} else {
						ball.x = 0;
					}
				}
				endX = ball.x;
				ball.vx = 0;
				ball.action = 'end';
				ball.t = Infinity;
				livingBallCount--;
			} else {
				ball.vx = END_SPEED;
				ball.t = (endX - ball.x) / END_SPEED;
				if (ball.t < 0) {
					ball.vx *= -1;
					ball.t *= -1;
				}
				ball.action = 'end';
			}
			return;
		default:
			item = allItems[ball.action];
			if (item.n > 0) {
				item.n--;
				collision = getCollisionSpeed(
					ball.x - item.x + (ball.noWall && item.x > INNER_WIDTH / 2 ? TOTAL_WIDTH : 0),
					ball.y - item.y,
					ball.vx, ball.vy
				);
				ball.vx = collision.vx;
				ball.vy = collision.vy;
				if (item.n === 0) {
					playSound('item-0');
					animations.push({
						x: item.x,
						y: item.y,
						r: item.r,
						type: 'remove-item',
						t: 0,
						dur: 1000
					});
				} else {
					playSound('item');
					r = 2 * item.r / (3 * (item.r + SMALL_R));
					animations.push({
						x: (1 - r) * item.x + r * (ball.x + (ball.noWall && item.x > INNER_WIDTH / 2 ? TOTAL_WIDTH : 0)),
						y: (1 - r) * item.y + r * ball.y,
						r: item.r / 3,
						type: 'hit',
						t: 0,
						dur: 500
					});
				}
			} else if (allItems[ball.action].n < 0) {
				switch (-item.n) {
				case 1: //new ball
					ballCount++;
					playSound('ball');
					break;
				case 2: //star
					starCount++;
					playSound('star');
					break;
				case 3: //back
					item.n = 0;
					allBalls.forEach(function (ball) {
						var collision;
						if (['end', 'start'].indexOf(ball.action) === -1) {
							ball.vx *= -1;
							ball.vy *= -1;
							collision = getNextCollision(ball.x, ball.y, ball.vx, ball.vy, ball.noWall);
							ball.t = collision.t;
							ball.action = collision.action;
						}
					});
					playSound('back');
					return;
				case 4: //destroy ball
					item.n = 0;
					ballCount--;
					ball.y = -2 * SMALL_R;
					ball.vx = 0;
					ball.vy = 0;
					ball.action = 'end';
					ball.t = Infinity;
					livingBallCount--;
					playSound('die');
					animations.push({
						x: item.x,
						y: item.y,
						r: 3 * item.r,
						type: 'die',
						t: 0,
						dur: 300
					});
					return;
				case 5: //random
					collision = getCollisionSpeed(10 * Math.random(), 10 * Math.random(), ball.vx, ball.vy);
					ball.vx = collision.vx;
					ball.vy = collision.vy;
					playSound('random');
					break;
				case 6: //toggle walls
					noWalls = !noWalls;
					playSound('toggle');
					break;
				case 7: //bomb
					r = item.r / LARGE_R * GRID;
					allItems.forEach(function (otherItem) {
						if (pythagoras(otherItem.x - item.x, otherItem.y - item.y) <= 2 * r * r) {
							otherItem.n = 0;
						}
					});
					playSound('explode');
					animations.push({
						x: item.x,
						y: item.y,
						r: 2 * r,
						type: 'explode',
						t: 0,
						dur: 500
					});
					break;
				case 8: //obstacle
					collision = getCollisionSpeed(
						ball.x - item.x + (ball.noWall && item.x > INNER_WIDTH / 2 ? TOTAL_WIDTH : 0),
						ball.y - item.y,
						ball.vx, ball.vy
					);
					ball.vx = collision.vx;
					ball.vy = collision.vy;
					collision = getNextCollision(ball.x, ball.y, ball.vx, ball.vy, ball.noWall);
					ball.t = collision.t;
					ball.action = collision.action;
					playSound('obstacle');
					return;
				}
				item.n = 0;
			}
		}
		collision = getNextCollision(ball.x, ball.y, ball.vx, ball.vy, ball.noWall);
		ball.t = collision.t;
		ball.action = collision.action;
	});
}

function doSteps (t) {
	var tStep, i;
	while (t > 0) {
		tStep = t;
		for (i = 0; i < allBalls.length; i++) {
			if (allBalls[i].t < tStep) {
				tStep = allBalls[i].t;
			}
		}
		doStep(tStep);
		t -= tStep;
	}
	return livingBallCount > 0;
}

function run (vx, vy, callback) {
	var lastTime;

	startVx = vx;
	startVy = vy;
	isRunning = true;

	function step (time) {
		var running;
		if (!lastTime) {
			lastTime = time;
			rAF(step);
		} else {
			running = doSteps(time - lastTime);
			lastTime = time;
			draw();
			if (running) {
				rAF(step);
			} else {
				isRunning = false;
				callback(endX);
			}
		}
	}
	rAF(step);
}

/*
H. Init
This part really iniatilizes everything and get's the game started.
*/
initVars();
showFirstIntro(initMenu);

})();