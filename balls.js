(function () {
"use strict";

/*
Sorry, the code is a mess, as almost everything is global. But passing around objects with
getters and setters doesn't really fit, so there's not so much of an alternative.
I tried to excessively comment the code instead, and hope that helps.
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
var GRID = 48, //size of grid unit in pixels
	SMALL_R = 10, //radius of small balls
	LARGE_R = GRID * 5 / 12, //typical radius of items (but may vary)
	PANEL_HEIGHT = GRID, //height of panel in pixels
	WIDTH = 7, HEIGHT = 10, //width and height of total area in GRID units
	INNER_WIDTH = WIDTH * GRID - 2 * SMALL_R, //width and height of inner area (i.e. where
	INNER_HEIGHT = HEIGHT * GRID - 2 * SMALL_R, //center of small balls can go) in pixels
	TOTAL_WIDTH = INNER_WIDTH + 2 * SMALL_R, //total width and height of canvas in pixels
	TOTAL_HEIGHT = INNER_HEIGHT + 2 * SMALL_R + PANEL_HEIGHT,
	EJECT_SPEED = 0.3, //speed of balls (in pixels/ms)
	END_SPEED = 0.4, //speed of balls moving to end position
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
	ballCount, livingBallCount, roundNumber, starCount, noWalls, isRunning, isMuted,
	ctx, backgroundGradient, icons, audio,
	rAF = window.requestAnimationFrame || window.mozRequestAnimationFrame;

/*
B. Utility functions
This part contains some utility functions
*/
function pythagoras (x, y) {
	return x * x + y * y;
}

function storePersistent (key, val) {
	try {
		//TODO
		sessionStorage.setItem(KEY_PREFIX + key, val);
	} catch (e) {
	}
}

function clearPersistent (key) {
	try {
		//TODO
		sessionStorage.removeItem(KEY_PREFIX + key);
	} catch (e) {
	}
}

function getPersistent (key) {
	try {
		//TODO
		return sessionStorage.getItem(KEY_PREFIX + key);
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

/*
C. Initialising
This part contains the code to iniatilize the game, i.e. that part of the game
that doesn't use the canvas.
*/
function initVars () {
	starCount = getPersistent('stars') || 0;
	isMuted = !!getPersistent('muted');
}

function initMenu () {
	var levels = [
		{type: 'hex', label: 'Easy (Hex)'},
		{type: 'hex-special', label: 'Surprise (Hex, Special)', stars: 10},
		{type: 'square', label: 'Classical', stars: 20},
		{type: 'square-special', label: 'Good Luck (Square, Special)', stars: 30},
		{type: 'chaos', label: 'Chaos', stars: 40},
		{type: 'chaos-special', label: 'Special Chaos', stars: 50}
	], html, records = JSON.parse(getPersistent('records') || '{}');
	if (getPersistent('state')) {
		levels.unshift({type: 'restore', label: 'Resume last game'});
	}
	html = levels.map(function (level) {
		var enabled = (level.stars || 0) <= starCount;
		return '<p><button ' + (enabled ? ('data-type="' + level.type + '"') : 'disabled') + '>' +
			level.label + (enabled ? (records[level.type] ? '<br>Your record: ' + records[level.type] : '') : ('<br>Collect ' + level.stars + ' stars to unlock')) +
			'</button></p>';
	});

	html.unshift('<p>Some aliens that tried to invade earth in the past are back. Prevent them from landing there spaceships as long as possible. Collect stars to unlock new levels. Total stars so far: ' + starCount + '</p>');
	document.body.innerHTML = '<div id="menu">' + html.join('') + '</div>';
	document.getElementById('menu').addEventListener('click', function (e) {
		var type = e.target.dataset.type;
		if (type) {
			initSound();
			initCanvas();
			play(function () {
				var msg = ['Game over.'];
				if (roundNumber > (records[gameType] || 0)) {
					records[gameType] = roundNumber;
					storePersistent('records', JSON.stringify(records));
					msg.push('New record!');
				}
				if (document.monetization && document.monetization.state === 'started') {
					starCount += 5;
					storePersistent('stars', starCount);
					msg.push('', 'As a Web Monetization', 'supporter, you get', '5 extra stars!');
				}
				drawLost(msg);
				playSound('end');
			}, type);
		}
	});
}

/*
D. Sound
This part contains all functions for sound.
*/
function initSound () {
	try {
		audio = new AudioContext();
	} catch (e) {
	}
}

//based on https://github.com/foumart/JS.13kGames/blob/master/lib/SoundFX.js
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
	//FIXME
	switch (type) {
	case 'item':
	case 'item-0':
	case 'ball':
	case 'star':
	case 'back':
	case 'die':
	case 'explode':
	case 'speed':
	case 'wall':
	case 'end':
		break;
	default: //shouldn't happen
		generateSound(100, -10, 15, 15, 0.7, 2);
	}
}

/*
E. Drawing
This part contains all functions related to canvas and drawing.
*/

function initCanvas () {
	var canvas;

	function getAction (e) {
		var x, y;
		x = (e.clientX - e.target.offsetLeft) / e.target.clientWidth * TOTAL_WIDTH;
		y = (e.clientY - e.target.offsetTop) / e.target.clientHeight * TOTAL_HEIGHT;
		if (y < PANEL_HEIGHT) {
			if (x < PANEL_HEIGHT) {
				return isRunning ? {
					title: 'Speed up',
					action: 'speed'
				} : {
					title: 'Menu',
					action: 'menu'
				};
			} else if (x > TOTAL_WIDTH - PANEL_HEIGHT) {
				return isMuted ? {
					title: 'Unmute',
					action: 'togglemute'
				} : {
					title: 'Mute',
					action: 'togglemute'
				};
			}
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

	icons = document.createElement('canvas');
	icons.width = GRID;
	icons.height = 12 * GRID;
	icons = icons.getContext('2d');
	//TODO load from image
	icons.font = 'bold ' + (GRID / 2) + 'px sans-serif';
	icons.textAlign = 'center';
	icons.textBaseline = 'middle';

	icons.fillStyle = 'rgba(200,255,200,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(100,255,100)';
	icons.fillText('+', GRID / 2, GRID / 2, GRID);

	icons.fillStyle = 'rgba(255,255,200,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 3 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(255,255,100)';
	icons.fillText('★', GRID / 2, 3 * GRID / 2, GRID);

	icons.fillStyle = 'rgba(255,200,2000,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 5 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(255,100,100)';
	icons.fillText('←', GRID / 2, 5 * GRID / 2, GRID);

	icons.fillStyle = 'rgba(255,200,255,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 7 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(255,255,255)';
	icons.fillText('☠', GRID / 2, 7 * GRID / 2, GRID);

	icons.fillStyle = 'rgba(255,200,255,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 9 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(255,100,255)';
	icons.fillText('?', GRID / 2, 9 * GRID / 2, GRID);

	icons.fillStyle = 'rgba(200,200,255,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 11 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(100,100,255)';
	icons.fillText('↔', GRID / 2, 11 * GRID / 2, GRID);

	icons.fillStyle = 'rgba(255,200,80,0.1)';
	icons.beginPath();
	icons.arc(GRID / 2, 13 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();
	icons.fillStyle = 'rgb(255,165,100)';
	icons.fillText('💣', GRID / 2, 13 * GRID / 2, GRID);

	icons.fillStyle = 'black';
	icons.beginPath();
	icons.arc(GRID / 2, 15 * GRID / 2, LARGE_R, 0, 2 * Math.PI);
	icons.fill();

	icons.fillStyle = 'white';
	icons.fillText('X', GRID / 2, 17 * GRID / 2, GRID);
	icons.fillText('S', GRID / 2, 19 * GRID / 2, GRID);
	icons.fillText('M', GRID / 2, 21 * GRID / 2, GRID);
	icons.fillText('S', GRID / 2, 23 * GRID / 2, GRID);
	icons = icons.canvas;

	resize();
	window.addEventListener('resize', resize);

	canvas.addEventListener('mousemove', function (e) {
		var action = getAction(e);
		if (action) {
			canvas.title = action.title;
			canvas.style.cursor = 'pointer';
		} else {
			canvas.title = '';
			canvas.style.cursor = '';
		}
	});
	canvas.addEventListener('click', function (e) {
		var action = getAction(e) || {};
		switch (action.action) {
		case 'speed': speedUp(1.3); break;
		case 'menu': location.reload(); /*initMenu();*/ break; //FIXME
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
	});
}

function resize () {
	var docEl = document.documentElement, scale, style;
	scale = Math.min(1, docEl.clientWidth / TOTAL_WIDTH, docEl.clientHeight / TOTAL_HEIGHT);
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
	drawText(roundNumber, TOTAL_WIDTH / 2, PANEL_HEIGHT / 2, TOTAL_WIDTH - 3 * PANEL_HEIGHT, PANEL_HEIGHT);
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
	animations.forEach(function (animation) {
		var state = (animation.dur - animation.t) / animation.dur;
		switch (animation.type) {
		case 'remove-item':
			ctx.fillStyle = 'hsla(' + START_COLOR + ',' + (100 * state) + '%,50%,' + state + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y, animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		case 'die':
			ctx.fillStyle = 'rgba(10,10,10,0.3)';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y, animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
			break;
		case 'explode':
			ctx.fillStyle = 'rgba(255,255,255,' + state + ')';
			ctx.beginPath();
			ctx.arc(SMALL_R + animation.x, PANEL_HEIGHT + SMALL_R + INNER_HEIGHT - animation.y, animation.r - animation.r * state, 0, 2 * Math.PI);
			ctx.fill();
		}
	});
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

function drawLost (texts) {
	var i;
	ctx.fillStyle = 'rgba(0,0,0,0.7)';
	ctx.fillRect(0, PANEL_HEIGHT, TOTAL_WIDTH, TOTAL_HEIGHT - PANEL_HEIGHT);
	ctx.fillStyle = 'white';
	for (i = 0; i < texts.length; i++) {
		drawText(texts[i], TOTAL_WIDTH / 2, TOTAL_HEIGHT / 2 + PANEL_HEIGHT / 2 - (texts.length - 1) / 2 * 1.5 * GRID + 1.5 * GRID * i, TOTAL_WIDTH, 1.5 * GRID);
	}
}

function drawHelp () {
	ctx.fillStyle = BALL_COLOR;
	ctx.beginPath();
	ctx.moveTo(TOTAL_WIDTH / 3, 2 * TOTAL_HEIGHT / 3);
	ctx.lineTo(TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4);
	ctx.lineTo(TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4 - 15);
	ctx.moveTo(TOTAL_WIDTH / 2, 3 * TOTAL_HEIGHT / 4);
	ctx.lineTo(TOTAL_WIDTH / 2 - 15, 3 * TOTAL_HEIGHT / 4);
	ctx.stroke();
	drawText('Drag to shoot', 3 * TOTAL_WIDTH / 4 - GRID / 2, 3 * TOTAL_HEIGHT / 4, TOTAL_WIDTH / 2, GRID / 2);
	drawText('(or use your keyboard:', 3 * TOTAL_WIDTH / 4, 3 * TOTAL_HEIGHT / 4 + GRID / 2, TOTAL_WIDTH / 2, GRID / 2);
	drawText('left and right cursor', 3 * TOTAL_WIDTH / 4, 3 * TOTAL_HEIGHT / 4 + GRID, TOTAL_WIDTH / 2, GRID / 2);
	drawText('to aim, Enter to shoot)', 3 * TOTAL_WIDTH / 4, 3 * TOTAL_HEIGHT / 4 + 1.5 * GRID, TOTAL_WIDTH / 2, GRID / 2);
}

/*
F. Round management
This part contains all functions for managing rounds, starting and ending them.
*/

//Eject
function waitEject (ballX, callback, v) {
	var mouse = false, key = false, startX, startY, keyX, keyY;

	function getSpeedFromDrag(x, y) {
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
		startX = e.screenX;
		startY = e.screenY;
		mouse = true;
		key = false;
		e.preventDefault();
	}

	function mousemoveHandler (e) {
		if (!mouse) {
			return;
		}
		moveHandler(e);
	}

	function moveHandler (e) {
		var v, l, t;
		e.preventDefault();
		v = getSpeedFromDrag(e.screenX - startX, e.screenY - startY);
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

	function upHandler (e) {
		var v;
		v = getSpeedFromDrag(e.screenX - startX, e.screenY - startY);
		e.preventDefault();
		draw();
		if (v) {
			document.documentElement.style.cursor = '';
			window.removeEventListener('mousedown', mousedownHandler);
			window.removeEventListener('mousemove', mousemoveHandler);
			window.removeEventListener('mouseup', upHandler);
			document.body.removeEventListener('keydown', keyHandler);
			callback(v.vx, v.vy);
		} else {
			drawNumberBalls(ballCount, ballX);
			mouse = false;
			key = false;
		}
	}

	function keyHandler (e) {
		var dir = 1;
		switch (e.key || e.keyCode) {
		case 13:
		case 'Enter':
			if (key) {
				e.screenX = keyX;
				e.screenY = keyY;
				upHandler(e);
			}
			break;
		case 37:
		case 'Left':
		case 'ArrowLeft':
			dir = -1;
			/*falls through*/
		case 39:
		case 'Right':
		case 'ArrowRight':
			if (!key) {
				startX = TOTAL_WIDTH / 2;
				startY = 0;
				keyX = startX;
				keyY = startY + 10;
				key = true;
				mouse = false;
			}
			//You can't precisely aim with the mouse, so you can't with keyboard either
			keyX -= dir * (2 + Math.floor(2 * Math.random()));
			keyY += Math.floor(2 * Math.random());
			e.screenX = keyX;
			e.screenY = keyY;
			moveHandler(e);
		}
	}

	if (v) {
		callback(v.vx, v.vy);
		return;
	}

	document.documentElement.style.cursor = 'crosshair';
	window.addEventListener('mousedown', mousedownHandler);
	window.addEventListener('mousemove', mousemoveHandler);
	window.addEventListener('mouseup', upHandler);
	document.body.addEventListener('keydown', keyHandler);
	drawNumberBalls(ballCount, ballX);
	if (!getPersistent('hint')) {
		drawHelp();
		storePersistent('hint', 1);
	}
}

function addNewItems () {
	var i, hex = gameType.slice(0, 3) === 'hex', allSpecial = gameType.indexOf('-special') > -1;

	//FIXME balance probabilities better (esp. for getNSpecial and doChaos)
	function getN () {
		if (allSpecial) {
			return getNSpecial();
		}
		if (Math.random() < 0.4) {
			return 0;
		}
		if (Math.random() < Math.min(0.15, 1 / ballCount)) {
			return -1;
		}
		if (Math.random() < 0.1) {
			return -2;
		}
		return Math.ceil(ballCount * Math.floor(2 + Math.random() * 3) / 2);
	}

	function getNSpecial () {
		if (Math.random() < 0.3) {
			return 0;
		}
		if (Math.random() < 0.2) {
			return [-2, -2, -2, -3, -3, -5, -5, -6, -6, -7, -8, -8][Math.floor(Math.random() * 12)];
		}
		if (Math.random() < Math.min(0.15, 1 / ballCount)) {
			return -1;
		}
		if (Math.random() < ballCount / 150) {
			return -4;
		}
		return Math.ceil(ballCount * Math.floor(2 + Math.random() * 3) / 2);
	}

	function doLine (h, f) {
		var x, start, d;
		if (hex) {
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
				n: f()
			});
		}
	}

	function doChaos (c, f) {
		var i, j, n, r, x, y, tries, good;
		for (i = 0; i < c; i++) {
			n = f();
			if (n === 0) {
				continue;
			}
			for (tries = 0; tries < 50; tries++) {
				r = LARGE_R * [0.75, 0.75, 1, 1, 1, 1.2][Math.floor(Math.random() * 6)],
				x = r + (TOTAL_WIDTH - 2 * r) * Math.random() - SMALL_R;
				y = INNER_HEIGHT - r - Math.random() * 2 * GRID + SMALL_R;
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

	if (gameType.slice(0, 5) === 'chaos') {
		doChaos(roundNumber === 1 ? 20 : 7, getN);
		return;
	}

	if (roundNumber === 1) {
		for (i = 1; i < 3; i++) {
			doLine(i, getN);
		}
	} else {
		if (allItems.length === 0) {
			//all cleared -> grant a row with stars
			doLine(2, function () {
				return -2;
			});
		}
		doLine(1, getN);
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
		if (item.y < GRID / 2 + SMALL_R + item.r) {
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
			//FIXME something doesn't work as expected sometimes, but it's hard to reproduce and thus difficult to fix
			//perhaps it even already is fixed
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
						r: item.r,
						type: 'die',
						t: 0,
						dur: 500
					});
					return;
				case 5: //random
					collision = getCollisionSpeed(10 * Math.random(), 10 * Math.random(), ball.vx, ball.vy);
					ball.vx = collision.vx;
					ball.vy = collision.vy;
					break;
				case 6: //toggle walls
					noWalls = !noWalls;
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
initMenu();

})();