(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(_dereq_,module,exports){
function corslite(url, callback, cors) {
    var sent = false;

    if (typeof window.XMLHttpRequest === 'undefined') {
        return callback(Error('Browser not supported'));
    }

    if (typeof cors === 'undefined') {
        var m = url.match(/^\s*https?:\/\/[^\/]*/);
        cors = m && (m[0] !== location.protocol + '//' + location.hostname +
                (location.port ? ':' + location.port : ''));
    }

    var x = new window.XMLHttpRequest();

    function isSuccessful(status) {
        return status >= 200 && status < 300 || status === 304;
    }

    if (cors && !('withCredentials' in x)) {
        // IE8-9
        x = new window.XDomainRequest();

        // Ensure callback is never called synchronously, i.e., before
        // x.send() returns (this has been observed in the wild).
        // See https://github.com/mapbox/mapbox.js/issues/472
        var original = callback;
        callback = function() {
            if (sent) {
                original.apply(this, arguments);
            } else {
                var that = this, args = arguments;
                setTimeout(function() {
                    original.apply(that, args);
                }, 0);
            }
        }
    }

    function loaded() {
        if (
            // XDomainRequest
            x.status === undefined ||
            // modern browsers
            isSuccessful(x.status)) callback.call(x, null, x);
        else callback.call(x, x, null);
    }

    // Both `onreadystatechange` and `onload` can fire. `onreadystatechange`
    // has [been supported for longer](http://stackoverflow.com/a/9181508/229001).
    if ('onload' in x) {
        x.onload = loaded;
    } else {
        x.onreadystatechange = function readystate() {
            if (x.readyState === 4) {
                loaded();
            }
        };
    }

    // Call the callback with the XMLHttpRequest object as an error and prevent
    // it from ever being called again by reassigning it to `noop`
    x.onerror = function error(evt) {
        // XDomainRequest provides no evt parameter
        callback.call(this, evt || true, null);
        callback = function() { };
    };

    // IE9 must have onprogress be set to a unique function.
    x.onprogress = function() { };

    x.ontimeout = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    x.onabort = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    // GET is the only supported HTTP Verb by XDomainRequest and is the
    // only one supported here.
    x.open('GET', url, true);

    // Send the request. Sending data is not supported.
    x.send(null);
    sent = true;

    return x;
}

if (typeof module !== 'undefined') module.exports = corslite;

},{}],2:[function(_dereq_,module,exports){
'use strict';

/**
 * Based off of [the offical Google document](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
 *
 * Some parts from [this implementation](http://facstaff.unca.edu/mcmcclur/GoogleMaps/EncodePolyline/PolylineEncoder.js)
 * by [Mark McClure](http://facstaff.unca.edu/mcmcclur/)
 *
 * @module polyline
 */

var polyline = {};

function py2_round(value) {
    // Google's polyline algorithm uses the same rounding strategy as Python 2, which is different from JS for negative values
    return Math.floor(Math.abs(value) + 0.5) * Math.sign(value);
}

function encode(current, previous, factor) {
    current = py2_round(current * factor);
    previous = py2_round(previous * factor);
    var coordinate = current - previous;
    coordinate <<= 1;
    if (current - previous < 0) {
        coordinate = ~coordinate;
    }
    var output = '';
    while (coordinate >= 0x20) {
        output += String.fromCharCode((0x20 | (coordinate & 0x1f)) + 63);
        coordinate >>= 5;
    }
    output += String.fromCharCode(coordinate + 63);
    return output;
}

/**
 * Decodes to a [latitude, longitude] coordinates array.
 *
 * This is adapted from the implementation in Project-OSRM.
 *
 * @param {String} str
 * @param {Number} precision
 * @returns {Array}
 *
 * @see https://github.com/Project-OSRM/osrm-frontend/blob/master/WebContent/routing/OSRM.RoutingGeometry.js
 */
polyline.decode = function(str, precision) {
    var index = 0,
        lat = 0,
        lng = 0,
        coordinates = [],
        shift = 0,
        result = 0,
        byte = null,
        latitude_change,
        longitude_change,
        factor = Math.pow(10, precision || 5);

    // Coordinates have variable length when encoded, so just keep
    // track of whether we've hit the end of the string. In each
    // loop iteration, a single coordinate is decoded.
    while (index < str.length) {

        // Reset shift, result, and byte
        byte = null;
        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        shift = result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        lat += latitude_change;
        lng += longitude_change;

        coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
};

/**
 * Encodes the given [latitude, longitude] coordinates array.
 *
 * @param {Array.<Array.<Number>>} coordinates
 * @param {Number} precision
 * @returns {String}
 */
polyline.encode = function(coordinates, precision) {
    if (!coordinates.length) { return ''; }

    var factor = Math.pow(10, precision || 5),
        output = encode(coordinates[0][0], 0, factor) + encode(coordinates[0][1], 0, factor);

    for (var i = 1; i < coordinates.length; i++) {
        var a = coordinates[i], b = coordinates[i - 1];
        output += encode(a[0], b[0], factor);
        output += encode(a[1], b[1], factor);
    }

    return output;
};

function flipped(coords) {
    var flipped = [];
    for (var i = 0; i < coords.length; i++) {
        flipped.push(coords[i].slice().reverse());
    }
    return flipped;
}

/**
 * Encodes a GeoJSON LineString feature/geometry.
 *
 * @param {Object} geojson
 * @param {Number} precision
 * @returns {String}
 */
polyline.fromGeoJSON = function(geojson, precision) {
    if (geojson && geojson.type === 'Feature') {
        geojson = geojson.geometry;
    }
    if (!geojson || geojson.type !== 'LineString') {
        throw new Error('Input must be a GeoJSON LineString');
    }
    return polyline.encode(flipped(geojson.coordinates), precision);
};

/**
 * Decodes to a GeoJSON LineString geometry.
 *
 * @param {String} str
 * @param {Number} precision
 * @returns {Object}
 */
polyline.toGeoJSON = function(str, precision) {
    var coords = polyline.decode(str, precision);
    return {
        type: 'LineString',
        coordinates: flipped(coords)
    };
};

if (typeof module === 'object' && module.exports) {
    module.exports = polyline;
}

},{}],3:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	module.exports = L.Class.extend({
		options: {
			timeout: 500,
			blurTimeout: 100,
			noResultsMessage: 'No results found.'
		},

		initialize: function(elem, callback, context, options) {
			L.setOptions(this, options);

			this._elem = elem;
			this._resultFn = options.resultFn ? L.Util.bind(options.resultFn, options.resultContext) : null;
			this._autocomplete = options.autocompleteFn ? L.Util.bind(options.autocompleteFn, options.autocompleteContext) : null;
			this._selectFn = L.Util.bind(callback, context);
			this._container = L.DomUtil.create('div', 'leaflet-routing-geocoder-result');
			this._resultTable = L.DomUtil.create('table', '', this._container);

			// TODO: looks a bit like a kludge to register same for input and keypress -
			// browsers supporting both will get duplicate events; just registering
			// input will not catch enter, though.
			L.DomEvent.addListener(this._elem, 'input', this._keyPressed, this);
			L.DomEvent.addListener(this._elem, 'keypress', this._keyPressed, this);
			L.DomEvent.addListener(this._elem, 'keydown', this._keyDown, this);
			L.DomEvent.addListener(this._elem, 'blur', function() {
				if (this._isOpen) {
					this.close();
				}
			}, this);
		},

		close: function() {
			L.DomUtil.removeClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = false;
		},

		_open: function() {
			var rect = this._elem.getBoundingClientRect();
			if (!this._container.parentElement) {
				// See notes section under https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX
				// This abomination is required to support all flavors of IE
				var scrollX = (window.pageXOffset !== undefined) ? window.pageXOffset
					: (document.documentElement || document.body.parentNode || document.body).scrollLeft;
				var scrollY = (window.pageYOffset !== undefined) ? window.pageYOffset
					: (document.documentElement || document.body.parentNode || document.body).scrollTop;
				this._container.style.left = (rect.left + scrollX) + 'px';
				this._container.style.top = (rect.bottom + scrollY) + 'px';
				this._container.style.width = (rect.right - rect.left) + 'px';
				document.body.appendChild(this._container);
			}

			L.DomUtil.addClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = true;
		},

		_setResults: function(results) {
			var i,
			    tr,
			    td,
			    text;

			delete this._selection;
			this._results = results;

			while (this._resultTable.firstChild) {
				this._resultTable.removeChild(this._resultTable.firstChild);
			}

			for (i = 0; i < results.length; i++) {
				tr = L.DomUtil.create('tr', '', this._resultTable);
				tr.setAttribute('data-result-index', i);
				td = L.DomUtil.create('td', '', tr);

				if (this.options.formatGeocoderResult) {
					text = this.options.formatGeocoderResult(results[i]);
				} else {
					text = document.createTextNode(results[i].name);
				}

				td.appendChild(text);
				// mousedown + click because:
				// http://stackoverflow.com/questions/10652852/jquery-fire-click-before-blur-event
				L.DomEvent.addListener(td, 'mousedown', L.DomEvent.preventDefault);
				L.DomEvent.addListener(td, 'click', this._createClickListener(results[i]));
			}

			if (!i) {
				tr = L.DomUtil.create('tr', '', this._resultTable);
				td = L.DomUtil.create('td', 'leaflet-routing-geocoder-no-results', tr);
				td.innerHTML = this.options.noResultsMessage;
			}

			this._open();

			if (results.length > 0) {
				// Select the first entry
				this._select(1);
			}
		},

		_createClickListener: function(r) {
			var resultSelected = this._resultSelected(r);
			return L.bind(function() {
				this._elem.blur();
				resultSelected();
			}, this);
		},

		_resultSelected: function(r) {
			return L.bind(function() {
				this.close();
				this._elem.value = r.name;
				this._lastCompletedText = r.name;
				this._selectFn(r);
			}, this);
		},

		_keyPressed: function(e) {
			var index;

			if (this._isOpen && e.keyCode === 13 && this._selection) {
				index = parseInt(this._selection.getAttribute('data-result-index'), 10);
				this._resultSelected(this._results[index])();
				L.DomEvent.preventDefault(e);
				return;
			}

			if (e.keyCode === 13) {
				L.DomEvent.preventDefault(e);
				this._complete(this._resultFn, true);
				return;
			}

			if (this._autocomplete && document.activeElement === this._elem) {
				if (this._timer) {
					clearTimeout(this._timer);
				}
				this._timer = setTimeout(L.Util.bind(function() { this._complete(this._autocomplete); }, this),
					this.options.timeout);
				return;
			}

			this._unselect();
		},

		_select: function(dir) {
			var sel = this._selection;
			if (sel) {
				L.DomUtil.removeClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				sel = sel[dir > 0 ? 'nextSibling' : 'previousSibling'];
			}
			if (!sel) {
				sel = this._resultTable[dir > 0 ? 'firstChild' : 'lastChild'];
			}

			if (sel) {
				L.DomUtil.addClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				this._selection = sel;
			}
		},

		_unselect: function() {
			if (this._selection) {
				L.DomUtil.removeClass(this._selection.firstChild, 'leaflet-routing-geocoder-selected');
			}
			delete this._selection;
		},

		_keyDown: function(e) {
			if (this._isOpen) {
				switch (e.keyCode) {
				// Escape
				case 27:
					this.close();
					L.DomEvent.preventDefault(e);
					return;
				// Up
				case 38:
					this._select(-1);
					L.DomEvent.preventDefault(e);
					return;
				// Down
				case 40:
					this._select(1);
					L.DomEvent.preventDefault(e);
					return;
				}
			}
		},

		_complete: function(completeFn, trySelect) {
			var v = this._elem.value;
			function completeResults(results) {
				this._lastCompletedText = v;
				if (trySelect && results.length === 1) {
					this._resultSelected(results[0])();
				} else {
					this._setResults(results);
				}
			}

			if (!v) {
				return;
			}

			if (v !== this._lastCompletedText) {
				completeFn(v, completeResults, this);
			} else if (trySelect) {
				completeResults.call(this, this._results);
			}
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],4:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	var Itinerary = _dereq_('./itinerary');
	var Line = _dereq_('./line');
	var Plan = _dereq_('./plan');
	var OSRMv1 = _dereq_('./osrm-v1');

	module.exports = Itinerary.extend({
		options: {
			fitSelectedRoutes: 'smart',
			routeLine: function(route, options) { return new Line(route, options); },
			autoRoute: true,
			routeWhileDragging: false,
			routeDragInterval: 500,
			waypointMode: 'connect',
			showAlternatives: false,
			defaultErrorHandler: function(e) {
				console.error('Routing error:', e.error);
			}
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);

			this._router = this.options.router || new OSRMv1(options);
			this._plan = this.options.plan || new Plan(this.options.waypoints, options);
			this._requestCount = 0;

			Itinerary.prototype.initialize.call(this, options);

			this.on('routeselected', this._routeSelected, this);
			if (this.options.defaultErrorHandler) {
				this.on('routingerror', this.options.defaultErrorHandler);
			}
			this._plan.on('waypointschanged', this._onWaypointsChanged, this);
			if (options.routeWhileDragging) {
				this._setupRouteDragging();
			}
		},

		_onZoomEnd: function() {
			if (!this._selectedRoute ||
				!this._router.requiresMoreDetail) {
				return;
			}

			var map = this._map;
			if (this._router.requiresMoreDetail(this._selectedRoute,
					map.getZoom(), map.getBounds())) {
				this.route({
					callback: L.bind(function(err, routes) {
						var i;
						if (!err) {
							for (i = 0; i < routes.length; i++) {
								this._routes[i].properties = routes[i].properties;
							}
							this._updateLineCallback(err, routes);
						}

					}, this),
					simplifyGeometry: false,
					geometryOnly: true
				});
			}
		},

		onAdd: function(map) {
			if (this.options.autoRoute) {
				this.route();
			}

			var container = Itinerary.prototype.onAdd.call(this, map);

			this._map = map;
			this._map.addLayer(this._plan);

			this._map.on('zoomend', this._onZoomEnd, this);

			if (this._plan.options.geocoder) {
				container.insertBefore(this._plan.createGeocoders(), container.firstChild);
			}

			return container;
		},

		onRemove: function(map) {
			map.off('zoomend', this._onZoomEnd, this);
			if (this._line) {
				map.removeLayer(this._line);
			}
			map.removeLayer(this._plan);
			if (this._alternatives && this._alternatives.length > 0) {
				for (var i = 0, len = this._alternatives.length; i < len; i++) {
					map.removeLayer(this._alternatives[i]);
				}
			}
			return Itinerary.prototype.onRemove.call(this, map);
		},

		getWaypoints: function() {
			return this._plan.getWaypoints();
		},

		setWaypoints: function(waypoints) {
			this._plan.setWaypoints(waypoints);
			return this;
		},

		spliceWaypoints: function() {
			var removed = this._plan.spliceWaypoints.apply(this._plan, arguments);
			return removed;
		},

		getPlan: function() {
			return this._plan;
		},

		getRouter: function() {
			return this._router;
		},

		_routeSelected: function(e) {
			var route = this._selectedRoute = e.route,
				alternatives = this.options.showAlternatives && e.alternatives,
				fitMode = this.options.fitSelectedRoutes,
				fitBounds =
					(fitMode === 'smart' && !this._waypointsVisible()) ||
					(fitMode !== 'smart' && fitMode);

			this._updateLines({route: route, alternatives: alternatives});

			if (fitBounds) {
				this._map.fitBounds(this._line.getBounds());
			}

			if (this.options.waypointMode === 'snap') {
				this._plan.off('waypointschanged', this._onWaypointsChanged, this);
				this.setWaypoints(route.waypoints);
				this._plan.on('waypointschanged', this._onWaypointsChanged, this);
			}
		},

		_waypointsVisible: function() {
			var wps = this.getWaypoints(),
				mapSize,
				bounds,
				boundsSize,
				i,
				p;

			try {
				mapSize = this._map.getSize();

				for (i = 0; i < wps.length; i++) {
					p = this._map.latLngToLayerPoint(wps[i].latLng);

					if (bounds) {
						bounds.extend(p);
					} else {
						bounds = L.bounds([p]);
					}
				}

				boundsSize = bounds.getSize();
				return (boundsSize.x > mapSize.x / 5 ||
					boundsSize.y > mapSize.y / 5) && this._waypointsInViewport();

			} catch (e) {
				return false;
			}
		},

		_waypointsInViewport: function() {
			var wps = this.getWaypoints(),
				mapBounds,
				i;

			try {
				mapBounds = this._map.getBounds();
			} catch (e) {
				return false;
			}

			for (i = 0; i < wps.length; i++) {
				if (mapBounds.contains(wps[i].latLng)) {
					return true;
				}
			}

			return false;
		},

		_updateLines: function(routes) {
			var addWaypoints = this.options.addWaypoints !== undefined ?
				this.options.addWaypoints : true;
			this._clearLines();

			// add alternatives first so they lie below the main route
			this._alternatives = [];
			if (routes.alternatives) routes.alternatives.forEach(function(alt, i) {
				this._alternatives[i] = this.options.routeLine(alt,
					L.extend({
						isAlternative: true
					}, this.options.altLineOptions || this.options.lineOptions));
				this._alternatives[i].addTo(this._map);
				this._hookAltEvents(this._alternatives[i]);
			}, this);

			this._line = this.options.routeLine(routes.route,
				L.extend({
					addWaypoints: addWaypoints,
					extendToWaypoints: this.options.waypointMode === 'connect'
				}, this.options.lineOptions));
			this._line.addTo(this._map);
			this._hookEvents(this._line);
		},

		_hookEvents: function(l) {
			l.on('linetouched', function(e) {
				if (e.afterIndex < this.getWaypoints().length - 1) {
					this._plan.dragNewWaypoint(e);
				}
			}, this);
		},

		_hookAltEvents: function(l) {
			l.on('linetouched', function(e) {
				var alts = this._routes.slice();
				var selected = alts.splice(e.target._route.routesIndex, 1)[0];
				this.fire('routeselected', {route: selected, alternatives: alts});
			}, this);
		},

		_onWaypointsChanged: function(e) {
			if (this.options.autoRoute) {
				this.route({});
			}
			if (!this._plan.isReady()) {
				this._clearLines();
				this._clearAlts();
			}
			this.fire('waypointschanged', {waypoints: e.waypoints});
		},

		_setupRouteDragging: function() {
			var timer = 0,
				waypoints;

			this._plan.on('waypointdrag', L.bind(function(e) {
				waypoints = e.waypoints;

				if (!timer) {
					timer = setTimeout(L.bind(function() {
						this.route({
							waypoints: waypoints,
							geometryOnly: true,
							callback: L.bind(this._updateLineCallback, this)
						});
						timer = undefined;
					}, this), this.options.routeDragInterval);
				}
			}, this));
			this._plan.on('waypointdragend', function() {
				if (timer) {
					clearTimeout(timer);
					timer = undefined;
				}
				this.route();
			}, this);
		},

		_updateLineCallback: function(err, routes) {
			if (!err) {
				routes = routes.slice();
				var selected = routes.splice(this._selectedRoute.routesIndex, 1)[0];
				this._updateLines({
					route: selected,
					alternatives: this.options.showAlternatives ? routes : []
				});
			} else if (err.type !== 'abort') {
				this._clearLines();
			}
		},

		route: function(options) {
			var ts = ++this._requestCount,
				wps;

			if (this._pendingRequest && this._pendingRequest.abort) {
				this._pendingRequest.abort();
				this._pendingRequest = null;
			}

			options = options || {};

			if (this._plan.isReady()) {
				if (this.options.useZoomParameter) {
					options.z = this._map && this._map.getZoom();
				}

				wps = options && options.waypoints || this._plan.getWaypoints();
				this.fire('routingstart', {waypoints: wps});
				this._pendingRequest = this._router.route(wps, function(err, routes) {
					this._pendingRequest = null;

					if (options.callback) {
						return options.callback.call(this, err, routes);
					}

					// Prevent race among multiple requests,
					// by checking the current request's count
					// against the last request's; ignore result if
					// this isn't the last request.
					if (ts === this._requestCount) {
						this._clearLines();
						this._clearAlts();
						if (err && err.type !== 'abort') {
							this.fire('routingerror', {error: err});
							return;
						}

						routes.forEach(function(route, i) { route.routesIndex = i; });

						if (!options.geometryOnly) {
							this.fire('routesfound', {waypoints: wps, routes: routes});
							this.setAlternatives(routes);
						} else {
							var selectedRoute = routes.splice(0,1)[0];
							this._routeSelected({route: selectedRoute, alternatives: routes});
						}
					}
				}, this, options);
			}
		},

		_clearLines: function() {
			if (this._line) {
				this._map.removeLayer(this._line);
				delete this._line;
			}
			if (this._alternatives && this._alternatives.length) {
				for (var i in this._alternatives) {
					this._map.removeLayer(this._alternatives[i]);
				}
				this._alternatives = [];
			}
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./itinerary":10,"./line":11,"./osrm-v1":15,"./plan":16}],5:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	module.exports = L.Control.extend({
		options: {
			header: 'Routing error',
			formatMessage: function(error) {
				if (error.status < 0) {
					return 'Calculating the route caused an error. Technical description follows: <code><pre>' +
						error.message + '</pre></code';
				} else {
					return 'The route could not be calculated. ' +
						error.message;
				}
			}
		},

		initialize: function(routingControl, options) {
			L.Control.prototype.initialize.call(this, options);
			routingControl
				.on('routingerror', L.bind(function(e) {
					if (this._element) {
						this._element.children[1].innerHTML = this.options.formatMessage(e.error);
						this._element.style.visibility = 'visible';
					}
				}, this))
				.on('routingstart', L.bind(function() {
					if (this._element) {
						this._element.style.visibility = 'hidden';
					}
				}, this));
		},

		onAdd: function() {
			var header,
				message;

			this._element = L.DomUtil.create('div', 'leaflet-bar leaflet-routing-error');
			this._element.style.visibility = 'hidden';

			header = L.DomUtil.create('h3', null, this._element);
			message = L.DomUtil.create('span', null, this._element);

			header.innerHTML = this.options.header;

			return this._element;
		},

		onRemove: function() {
			delete this._element;
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	var Localization = _dereq_('./localization');

	module.exports = L.Class.extend({
		options: {
			units: 'metric',
			unitNames: null,
			language: 'en',
			roundingSensitivity: 1,
			distanceTemplate: '{value} {unit}'
		},

		initialize: function(options) {
			L.setOptions(this, options);

			var langs = L.Util.isArray(this.options.language) ?
				this.options.language :
				[this.options.language, 'en'];
			this._localization = new Localization(langs);
		},

		formatDistance: function(d /* Number (meters) */, sensitivity) {
			var un = this.options.unitNames || this._localization.localize('units'),
				simpleRounding = sensitivity <= 0,
				round = simpleRounding ? function(v) { return v; } : L.bind(this._round, this),
			    v,
			    yards,
				data,
				pow10;

			if (this.options.units === 'imperial') {
				yards = d / 0.9144;
				if (yards >= 1000) {
					data = {
						value: round(d / 1609.344, sensitivity),
						unit: un.miles
					};
				} else {
					data = {
						value: round(yards, sensitivity),
						unit: un.yards
					};
				}
			} else {
				v = round(d, sensitivity);
				data = {
					value: v >= 1000 ? (v / 1000) : v,
					unit: v >= 1000 ? un.kilometers : un.meters
				};
			}

			if (simpleRounding) {
				data.value = data.value.toFixed(-sensitivity);
			}

			return L.Util.template(this.options.distanceTemplate, data);
		},

		_round: function(d, sensitivity) {
			var s = sensitivity || this.options.roundingSensitivity,
				pow10 = Math.pow(10, (Math.floor(d / s) + '').length - 1),
				r = Math.floor(d / pow10),
				p = (r > 5) ? pow10 : pow10 / 2;

			return Math.round(d / p) * p;
		},

		formatTime: function(t /* Number (seconds) */) {
			var un = this.options.unitNames || this._localization.localize('units');
			// More than 30 seconds precision looks ridiculous
			t = Math.round(t / 30) * 30;

			if (t > 86400) {
				return Math.round(t / 3600) + ' ' + un.hours;
			} else if (t > 3600) {
				return Math.floor(t / 3600) + ' ' + un.hours + ' ' +
					Math.round((t % 3600) / 60) + ' ' + un.minutes;
			} else if (t > 300) {
				return Math.round(t / 60) + ' ' + un.minutes;
			} else if (t > 60) {
				return Math.floor(t / 60) + ' ' + un.minutes +
					(t % 60 !== 0 ? ' ' + (t % 60) + ' ' + un.seconds : '');
			} else {
				return t + ' ' + un.seconds;
			}
		},

		formatInstruction: function(instr, i) {
			if (instr.text === undefined) {
				return this.capitalize(L.Util.template(this._getInstructionTemplate(instr, i),
					L.extend({}, instr, {
						exitStr: instr.exit ? this._localization.localize('formatOrder')(instr.exit) : '',
						dir: this._localization.localize(['directions', instr.direction]),
						modifier: this._localization.localize(['directions', instr.modifier])
					})));
			} else {
				return instr.text;
			}
		},

		getIconName: function(instr, i) {
			switch (instr.type) {
			case 'Head':
				if (i === 0) {
					return 'depart';
				}
				break;
			case 'WaypointReached':
				return 'via';
			case 'Roundabout':
				return 'enter-roundabout';
			case 'DestinationReached':
				return 'arrive';
			}

			switch (instr.modifier) {
			case 'Straight':
				return 'continue';
			case 'SlightRight':
				return 'bear-right';
			case 'Right':
				return 'turn-right';
			case 'SharpRight':
				return 'sharp-right';
			case 'TurnAround':
			case 'Uturn':
				return 'u-turn';
			case 'SharpLeft':
				return 'sharp-left';
			case 'Left':
				return 'turn-left';
			case 'SlightLeft':
				return 'bear-left';
			}
		},

		capitalize: function(s) {
			return s.charAt(0).toUpperCase() + s.substring(1);
		},

		_getInstructionTemplate: function(instr, i) {
			var type = instr.type === 'Straight' ? (i === 0 ? 'Head' : 'Continue') : instr.type,
				strings = this._localization.localize(['instructions', type]);

			if (!strings) {
				strings = [
					this._localization.localize(['directions', type]),
					' ' + this._localization.localize(['instructions', 'Onto'])
				];
			}

			return strings[0] + (strings.length > 1 && instr.road ? strings[1] : '');
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./localization":12}],7:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);
	var Autocomplete = _dereq_('./autocomplete');
	var Localization = _dereq_('./localization');

	function selectInputText(input) {
		if (input.setSelectionRange) {
			// On iOS, select() doesn't work
			input.setSelectionRange(0, 9999);
		} else {
			// On at least IE8, setSeleectionRange doesn't exist
			input.select();
		}
	}

	module.exports = L.Class.extend({
		includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

		options: {
			createGeocoder: function(i, nWps, options) {
				var container = L.DomUtil.create('div', 'leaflet-routing-geocoder'),
					input = L.DomUtil.create('input', '', container),
					remove = options.addWaypoints ? L.DomUtil.create('span', 'leaflet-routing-remove-waypoint', container) : undefined;

				input.disabled = !options.addWaypoints;

				return {
					container: container,
					input: input,
					closeButton: remove
				};
			},
			geocoderPlaceholder: function(i, numberWaypoints, geocoderElement) {
				var l = new Localization(geocoderElement.options.language).localize('ui');
				return i === 0 ?
					l.startPlaceholder :
					(i < numberWaypoints - 1 ?
						L.Util.template(l.viaPlaceholder, {viaNumber: i}) :
						l.endPlaceholder);
			},

			geocoderClass: function() {
				return '';
			},

			waypointNameFallback: function(latLng) {
				var ns = latLng.lat < 0 ? 'S' : 'N',
					ew = latLng.lng < 0 ? 'W' : 'E',
					lat = (Math.round(Math.abs(latLng.lat) * 10000) / 10000).toString(),
					lng = (Math.round(Math.abs(latLng.lng) * 10000) / 10000).toString();
				return ns + lat + ', ' + ew + lng;
			},
			maxGeocoderTolerance: 200,
			autocompleteOptions: {},
			language: 'en',
		},

		initialize: function(wp, i, nWps, options) {
			L.setOptions(this, options);

			var g = this.options.createGeocoder(i, nWps, this.options),
				closeButton = g.closeButton,
				geocoderInput = g.input;
			geocoderInput.setAttribute('placeholder', this.options.geocoderPlaceholder(i, nWps, this));
			geocoderInput.className = this.options.geocoderClass(i, nWps);

			this._element = g;
			this._waypoint = wp;

			this.update();
			// This has to be here, or geocoder's value will not be properly
			// initialized.
			// TODO: look into why and make _updateWaypointName fix this.
			geocoderInput.value = wp.name;

			L.DomEvent.addListener(geocoderInput, 'click', function() {
				selectInputText(this);
			}, geocoderInput);

			if (closeButton) {
				L.DomEvent.addListener(closeButton, 'click', function() {
					this.fire('delete', { waypoint: this._waypoint });
				}, this);
			}

			if (typeof this.options.formatGeocoderResult == 'function') {
				this.options.autocompleteOptions.formatGeocoderResult = this.options.formatGeocoderResult;
			}

			new Autocomplete(geocoderInput, function(r) {
					geocoderInput.value = r.name;
					wp.name = r.name;
					wp.latLng = r.center;
					this.fire('geocoded', { waypoint: wp, value: r });
				}, this, L.extend({
					resultFn: this.options.geocoder.geocode,
					resultContext: this.options.geocoder,
					autocompleteFn: this.options.geocoder.suggest,
					autocompleteContext: this.options.geocoder
				}, this.options.autocompleteOptions));
		},

		getContainer: function() {
			return this._element.container;
		},

		setValue: function(v) {
			this._element.input.value = v;
		},

		update: function(force) {
			var wp = this._waypoint,
				wpCoords;

			wp.name = wp.name || '';

			if (wp.latLng && (force || !wp.name)) {
				wpCoords = this.options.waypointNameFallback(wp.latLng);
				if (this.options.geocoder && this.options.geocoder.reverse) {
					this.options.geocoder.reverse(wp.latLng, 67108864 /* zoom 18 */, function(rs) {
						if (rs.length > 0 && rs[0].center.distanceTo(wp.latLng) < this.options.maxGeocoderTolerance) {
							wp.name = rs[0].name;
						} else {
							wp.name = wpCoords;
						}
						this._update();
					}, this);
				} else {
					wp.name = wpCoords;
					this._update();
				}
			}
		},

		focus: function() {
			var input = this._element.input;
			input.focus();
			selectInputText(input);
		},

		_update: function() {
			var wp = this._waypoint,
			    value = wp && wp.name ? wp.name : '';
			this.setValue(value);
			this.fire('reversegeocoded', {waypoint: wp, value: value});
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./autocomplete":3,"./localization":12}],8:[function(_dereq_,module,exports){
(function (global){
var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null),
    Control = _dereq_('./control'),
    Itinerary = _dereq_('./itinerary'),
    Line = _dereq_('./line'),
    OSRMv1 = _dereq_('./osrm-v1'),
    Plan = _dereq_('./plan'),
    Waypoint = _dereq_('./waypoint'),
    Autocomplete = _dereq_('./autocomplete'),
    Formatter = _dereq_('./formatter'),
    GeocoderElement = _dereq_('./geocoder-element'),
    Localization = _dereq_('./localization_simple'),
    ItineraryBuilder = _dereq_('./itinerary-builder'),
    Mapbox = _dereq_('./mapbox'),
    ErrorControl = _dereq_('./error-control');

L.routing = {
    control: function(options) { return new Control(options); },
    itinerary: function(options) {
        return Itinerary(options);
    },
    line: function(route, options) {
        return new Line(route, options);
    },
    plan: function(waypoints, options) {
        return new Plan(waypoints, options);
    },
    waypoint: function(latLng, name, options) {
        return new Waypoint(latLng, name, options);
    },
    osrmv1: function(options) {
        return new OSRMv1(options);
    },
    localization: function(options) {
        return new Localization(options);
    },
    formatter: function(options) {
        return new Formatter(options);
    },
    geocoderElement: function(wp, i, nWps, plan) {
        return new L.Routing.GeocoderElement(wp, i, nWps, plan);
    },
    itineraryBuilder: function(options) {
        return new ItineraryBuilder(options);
    },
    mapbox: function(accessToken, options) {
        return new Mapbox(accessToken, options);
    },
    errorControl: function(routingControl, options) {
        return new ErrorControl(routingControl, options);
    },
    autocomplete: function(elem, callback, context, options) {
        return new Autocomplete(elem, callback, context, options);
    }
};

module.exports = L.Routing = {
    Control: Control,
    Itinerary: Itinerary,
    Line: Line,
    OSRMv1: OSRMv1,
    Plan: Plan,
    Waypoint: Waypoint,
    Autocomplete: Autocomplete,
    Formatter: Formatter,
    GeocoderElement: GeocoderElement,
    Localization: Localization,
    ItineraryBuilder: ItineraryBuilder,

    // Legacy; remove these in next major release
    control: L.routing.control,
    itinerary: L.routing.itinerary,
    line: L.routing.line,
    plan: L.routing.plan,
    waypoint: L.routing.waypoint,
    osrmv1: L.routing.osrmv1,
    geocoderElement: L.routing.geocoderElement,
    mapbox: L.routing.mapbox,
    errorControl: L.routing.errorControl,
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./autocomplete":3,"./control":4,"./error-control":5,"./formatter":6,"./geocoder-element":7,"./itinerary":10,"./itinerary-builder":9,"./line":11,"./localization_simple":13,"./mapbox":14,"./osrm-v1":15,"./plan":16,"./waypoint":17}],9:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	module.exports = L.Class.extend({
		options: {
			containerClassName: ''
		},

		initialize: function(options) {
			L.setOptions(this, options);
		},

		createContainer: function(className) {
			var table = L.DomUtil.create('table', (className || '') + ' ' + this.options.containerClassName),
				colgroup = L.DomUtil.create('colgroup', '', table);

			L.DomUtil.create('col', 'leaflet-routing-instruction-icon', colgroup);
			L.DomUtil.create('col', 'leaflet-routing-instruction-text', colgroup);
			L.DomUtil.create('col', 'leaflet-routing-instruction-distance', colgroup);

			return table;
		},

		createStepsContainer: function() {
			return L.DomUtil.create('tbody', '');
		},

		createStep: function(text, distance, icon, steps) {
			var row = L.DomUtil.create('tr', '', steps),
				span,
				td;
			td = L.DomUtil.create('td', '', row);
			span = L.DomUtil.create('span', 'leaflet-routing-icon leaflet-routing-icon-'+icon, td);
			td.appendChild(span);
			td = L.DomUtil.create('td', '', row);
			td.appendChild(document.createTextNode(text));
			td = L.DomUtil.create('td', '', row);
			td.appendChild(document.createTextNode(distance));
			return row;
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);
	var Formatter = _dereq_('./formatter');
	var ItineraryBuilder = _dereq_('./itinerary-builder');

	module.exports = L.Control.extend({
		includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

		options: {
			pointMarkerStyle: {
				radius: 5,
				color: '#03f',
				fillColor: 'white',
				opacity: 1,
				fillOpacity: 0.7
			},
			summaryTemplate: '<h2>{name}</h2><h3>{distance}, {time}</h3>',
			timeTemplate: '{time}',
			containerClassName: '',
			alternativeClassName: '',
			minimizedClassName: '',
			itineraryClassName: '',
			totalDistanceRoundingSensitivity: -1,
			show: true,
			collapsible: undefined,
			collapseBtn: function(itinerary) {
				var collapseBtn = L.DomUtil.create('span', itinerary.options.collapseBtnClass);
				L.DomEvent.on(collapseBtn, 'click', itinerary._toggle, itinerary);
				itinerary._container.insertBefore(collapseBtn, itinerary._container.firstChild);
			},
			collapseBtnClass: 'leaflet-routing-collapse-btn'
		},

		initialize: function(options) {
			L.setOptions(this, options);
			this._formatter = this.options.formatter || new Formatter(this.options);
			this._itineraryBuilder = this.options.itineraryBuilder || new ItineraryBuilder({
				containerClassName: this.options.itineraryClassName
			});
		},

		onAdd: function(map) {
			var collapsible = this.options.collapsible;

			collapsible = collapsible || (collapsible === undefined && map.getSize().x <= 640);

			this._container = L.DomUtil.create('div', 'leaflet-routing-container leaflet-bar ' +
				(!this.options.show ? 'leaflet-routing-container-hide ' : '') +
				(collapsible ? 'leaflet-routing-collapsible ' : '') +
				this.options.containerClassName);
			this._altContainer = this.createAlternativesContainer();
			this._container.appendChild(this._altContainer);
			L.DomEvent.disableClickPropagation(this._container);
			L.DomEvent.addListener(this._container, 'mousewheel', function(e) {
				L.DomEvent.stopPropagation(e);
			});

			if (collapsible) {
				this.options.collapseBtn(this);
			}

			return this._container;
		},

		onRemove: function() {
		},

		createAlternativesContainer: function() {
			return L.DomUtil.create('div', 'leaflet-routing-alternatives-container');
		},

		setAlternatives: function(routes) {
			var i,
			    alt,
			    altDiv;

			this._clearAlts();

			this._routes = routes;

			for (i = 0; i < this._routes.length; i++) {
				alt = this._routes[i];
				altDiv = this._createAlternative(alt, i);
				this._altContainer.appendChild(altDiv);
				this._altElements.push(altDiv);
			}

			this._selectRoute({route: this._routes[0], alternatives: this._routes.slice(1)});

			return this;
		},

		show: function() {
			L.DomUtil.removeClass(this._container, 'leaflet-routing-container-hide');
		},

		hide: function() {
			L.DomUtil.addClass(this._container, 'leaflet-routing-container-hide');
		},

		_toggle: function() {
			var collapsed = L.DomUtil.hasClass(this._container, 'leaflet-routing-container-hide');
			this[collapsed ? 'show' : 'hide']();
		},

		_createAlternative: function(alt, i) {
			var altDiv = L.DomUtil.create('div', 'leaflet-routing-alt ' +
				this.options.alternativeClassName +
				(i > 0 ? ' leaflet-routing-alt-minimized ' + this.options.minimizedClassName : '')),
				template = this.options.summaryTemplate,
				data = L.extend({
					name: alt.name,
					distance: this._formatter.formatDistance(alt.summary.totalDistance, this.options.totalDistanceRoundingSensitivity),
					time: this._formatter.formatTime(alt.summary.totalTime)
				}, alt);
			altDiv.innerHTML = typeof(template) === 'function' ? template(data) : L.Util.template(template, data);
			L.DomEvent.addListener(altDiv, 'click', this._onAltClicked, this);
			this.on('routeselected', this._selectAlt, this);

			altDiv.appendChild(this._createItineraryContainer(alt));
			return altDiv;
		},

		_clearAlts: function() {
			var el = this._altContainer;
			while (el && el.firstChild) {
				el.removeChild(el.firstChild);
			}

			this._altElements = [];
		},

		_createItineraryContainer: function(r) {
			var container = this._itineraryBuilder.createContainer(),
			    steps = this._itineraryBuilder.createStepsContainer(),
			    i,
			    instr,
			    step,
			    distance,
			    text,
			    icon;

			container.appendChild(steps);

			for (i = 0; i < r.instructions.length; i++) {
				instr = r.instructions[i];
				text = this._formatter.formatInstruction(instr, i);
				distance = this._formatter.formatDistance(instr.distance);
				icon = this._formatter.getIconName(instr, i);
				step = this._itineraryBuilder.createStep(text, distance, icon, steps);

				if(instr.index) {
					this._addRowListeners(step, r.coordinates[instr.index]);
				}
			}

			return container;
		},

		_addRowListeners: function(row, coordinate) {
			L.DomEvent.addListener(row, 'mouseover', function() {
				this._marker = L.circleMarker(coordinate,
					this.options.pointMarkerStyle).addTo(this._map);
			}, this);
			L.DomEvent.addListener(row, 'mouseout', function() {
				if (this._marker) {
					this._map.removeLayer(this._marker);
					delete this._marker;
				}
			}, this);
			L.DomEvent.addListener(row, 'click', function(e) {
				this._map.panTo(coordinate);
				L.DomEvent.stopPropagation(e);
			}, this);
		},

		_onAltClicked: function(e) {
			var altElem = e.target || window.event.srcElement;
			while (!L.DomUtil.hasClass(altElem, 'leaflet-routing-alt')) {
				altElem = altElem.parentElement;
			}

			var j = this._altElements.indexOf(altElem);
			var alts = this._routes.slice();
			var route = alts.splice(j, 1)[0];

			this.fire('routeselected', {
				route: route,
				alternatives: alts
			});
		},

		_selectAlt: function(e) {
			var altElem,
			    j,
			    n,
			    classFn;

			altElem = this._altElements[e.route.routesIndex];

			if (L.DomUtil.hasClass(altElem, 'leaflet-routing-alt-minimized')) {
				for (j = 0; j < this._altElements.length; j++) {
					n = this._altElements[j];
					classFn = j === e.route.routesIndex ? 'removeClass' : 'addClass';
					L.DomUtil[classFn](n, 'leaflet-routing-alt-minimized');
					if (this.options.minimizedClassName) {
						L.DomUtil[classFn](n, this.options.minimizedClassName);
					}

					if (j !== e.route.routesIndex) n.scrollTop = 0;
				}
			}

			L.DomEvent.stop(e);
		},

		_selectRoute: function(routes) {
			if (this._marker) {
				this._map.removeLayer(this._marker);
				delete this._marker;
			}
			this.fire('routeselected', routes);
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./formatter":6,"./itinerary-builder":9}],11:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	module.exports = L.LayerGroup.extend({
		includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

		options: {
			styles: [
				{color: 'black', opacity: 0.15, weight: 9},
				{color: 'white', opacity: 0.8, weight: 6},
				{color: 'red', opacity: 1, weight: 2}
			],
			missingRouteStyles: [
				{color: 'black', opacity: 0.15, weight: 7},
				{color: 'white', opacity: 0.6, weight: 4},
				{color: 'gray', opacity: 0.8, weight: 2, dashArray: '7,12'}
			],
			addWaypoints: true,
			extendToWaypoints: true,
			missingRouteTolerance: 10
		},

		initialize: function(route, options) {
			L.setOptions(this, options);
			L.LayerGroup.prototype.initialize.call(this, options);
			this._route = route;

			if (this.options.extendToWaypoints) {
				this._extendToWaypoints();
			}

			this._addSegment(
				route.coordinates,
				this.options.styles,
				this.options.addWaypoints);
		},

		getBounds: function() {
			return L.latLngBounds(this._route.coordinates);
		},

		_findWaypointIndices: function() {
			var wps = this._route.inputWaypoints,
			    indices = [],
			    i;
			for (i = 0; i < wps.length; i++) {
				indices.push(this._findClosestRoutePoint(wps[i].latLng));
			}

			return indices;
		},

		_findClosestRoutePoint: function(latlng) {
			var minDist = Number.MAX_VALUE,
				minIndex,
			    i,
			    d;

			for (i = this._route.coordinates.length - 1; i >= 0 ; i--) {
				// TODO: maybe do this in pixel space instead?
				d = latlng.distanceTo(this._route.coordinates[i]);
				if (d < minDist) {
					minIndex = i;
					minDist = d;
				}
			}

			return minIndex;
		},

		_extendToWaypoints: function() {
			var wps = this._route.inputWaypoints,
				wpIndices = this._getWaypointIndices(),
			    i,
			    wpLatLng,
			    routeCoord;

			for (i = 0; i < wps.length; i++) {
				wpLatLng = wps[i].latLng;
				routeCoord = L.latLng(this._route.coordinates[wpIndices[i]]);
				if (wpLatLng.distanceTo(routeCoord) >
					this.options.missingRouteTolerance) {
					this._addSegment([wpLatLng, routeCoord],
						this.options.missingRouteStyles);
				}
			}
		},

		_addSegment: function(coords, styles, mouselistener) {
			var i,
				pl;

			for (i = 0; i < styles.length; i++) {
				pl = L.polyline(coords, styles[i]);
				this.addLayer(pl);
				if (mouselistener) {
					pl.on('mousedown', this._onLineTouched, this);
				}
			}
		},

		_findNearestWpBefore: function(i) {
			var wpIndices = this._getWaypointIndices(),
				j = wpIndices.length - 1;
			while (j >= 0 && wpIndices[j] > i) {
				j--;
			}

			return j;
		},

		_onLineTouched: function(e) {
			var afterIndex = this._findNearestWpBefore(this._findClosestRoutePoint(e.latlng));
			this.fire('linetouched', {
				afterIndex: afterIndex,
				latlng: e.latlng
			});
			L.DomEvent.stop(e);
		},

		_getWaypointIndices: function() {
			if (!this._wpIndices) {
				this._wpIndices = this._route.waypointIndices || this._findWaypointIndices();
			}

			return this._wpIndices;
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],12:[function(_dereq_,module,exports){
/* 
   NOTICE
   Since version 3.2.5, the functionality in this file is by
   default NOT used for localizing OSRM instructions.
   Instead, we rely on the module osrm-text-instructions (https://github.com/Project-OSRM/osrm-text-instructions/).
   
   This file can still be used for other routing backends, or if you specify the
   stepToText option in the OSRMv1 class.
*/

(function() {
	'use strict';

	var spanish = {
		directions: {
			N: 'norte',
			NE: 'noreste',
			E: 'este',
			SE: 'sureste',
			S: 'sur',
			SW: 'suroeste',
			W: 'oeste',
			NW: 'noroeste',
			SlightRight: 'leve giro a la derecha',
			Right: 'derecha',
			SharpRight: 'giro pronunciado a la derecha',
			SlightLeft: 'leve giro a la izquierda',
			Left: 'izquierda',
			SharpLeft: 'giro pronunciado a la izquierda',
			Uturn: 'media vuelta'
		},
		instructions: {
			// instruction, postfix if the road is named
			'Head':
				['Derecho {dir}', ' sobre {road}'],
			'Continue':
				['Continuar {dir}', ' en {road}'],
			'TurnAround':
				['Dar vuelta'],
			'WaypointReached':
				['Llegó a un punto del camino'],
			'Roundabout':
				['Tomar {exitStr} salida en la rotonda', ' en {road}'],
			'DestinationReached':
				['Llegada a destino'],
			'Fork': ['En el cruce gira a {modifier}', ' hacia {road}'],
			'Merge': ['Incorpórate {modifier}', ' hacia {road}'],
			'OnRamp': ['Gira {modifier} en la salida', ' hacia {road}'],
			'OffRamp': ['Toma la salida {modifier}', ' hacia {road}'],
			'EndOfRoad': ['Gira {modifier} al final de la carretera', ' hacia {road}'],
			'Onto': 'hacia {road}'
		},
		formatOrder: function(n) {
			return n + 'º';
		},
		ui: {
			startPlaceholder: 'Inicio',
			viaPlaceholder: 'Via {viaNumber}',
			endPlaceholder: 'Destino'
		},
		units: {
			meters: 'm',
			kilometers: 'km',
			yards: 'yd',
			miles: 'mi',
			hours: 'h',
			minutes: 'min',
			seconds: 's'
		}
	};

	L.Routing = L.Routing || {};

	var Localization = L.Class.extend({
		initialize: function(langs) {
			this._langs = L.Util.isArray(langs) ? langs.slice() : [langs, 'en'];

			for (var i = 0, l = this._langs.length; i < l; i++) {
				var generalizedCode = /([A-Za-z]+)/.exec(this._langs[i])[1]
				if (!Localization[this._langs[i]]) {
					if (Localization[generalizedCode]) {
						this._langs[i] = generalizedCode;
					} else {
						throw new Error('No localization for language "' + this._langs[i] + '".');
					}
				}
			}
		},

		localize: function(keys) {
			var dict,
				key,
				value;

			keys = L.Util.isArray(keys) ? keys : [keys];

			for (var i = 0, l = this._langs.length; i < l; i++) {
				dict = Localization[this._langs[i]];
				for (var j = 0, nKeys = keys.length; dict && j < nKeys; j++) {
					key = keys[j];
					value = dict[key];
					dict = value;
				}

				if (value) {
					return value;
				}
			}
		}
	});

	module.exports = L.extend(Localization, {
		'en': {
			directions: {
				N: 'north',
				NE: 'northeast',
				E: 'east',
				SE: 'southeast',
				S: 'south',
				SW: 'southwest',
				W: 'west',
				NW: 'northwest',
				SlightRight: 'slight right',
				Right: 'right',
				SharpRight: 'sharp right',
				SlightLeft: 'slight left',
				Left: 'left',
				SharpLeft: 'sharp left',
				Uturn: 'Turn around'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Head {dir}', ' on {road}'],
				'Continue':
					['Continue {dir}'],
				'TurnAround':
					['Turn around'],
				'WaypointReached':
					['Waypoint reached'],
				'Roundabout':
					['Take the {exitStr} exit in the roundabout', ' onto {road}'],
				'DestinationReached':
					['Destination reached'],
				'Fork': ['At the fork, turn {modifier}', ' onto {road}'],
				'Merge': ['Merge {modifier}', ' onto {road}'],
				'OnRamp': ['Turn {modifier} on the ramp', ' onto {road}'],
				'OffRamp': ['Take the ramp on the {modifier}', ' onto {road}'],
				'EndOfRoad': ['Turn {modifier} at the end of the road', ' onto {road}'],
				'Onto': 'onto {road}'
			},
			formatOrder: function(n) {
				var i = n % 10 - 1,
				suffix = ['st', 'nd', 'rd'];

				return suffix[i] ? n + suffix[i] : n + 'th';
			},
			ui: {
				startPlaceholder: 'Start',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'End'
			},
			units: {
				meters: 'm',
				kilometers: 'km',
				yards: 'yd',
				miles: 'mi',
				hours: 'h',
				minutes: 'min',
				seconds: 's'
			}
		},

		'de': {
			directions: {
				N: 'Norden',
				NE: 'Nordosten',
				E: 'Osten',
				SE: 'Südosten',
				S: 'Süden',
				SW: 'Südwesten',
				W: 'Westen',
				NW: 'Nordwesten',
				SlightRight: 'leicht rechts',
				Right: 'rechts',
				SharpRight: 'scharf rechts',
				SlightLeft: 'leicht links',
				Left: 'links',
				SharpLeft: 'scharf links',
				Uturn: 'Wenden'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Richtung {dir}', ' auf {road}'],
				'Continue':
					['Geradeaus Richtung {dir}', ' auf {road}'],
				'SlightRight':
					['Leicht rechts abbiegen', ' auf {road}'],
				'Right':
					['Rechts abbiegen', ' auf {road}'],
				'SharpRight':
					['Scharf rechts abbiegen', ' auf {road}'],
				'TurnAround':
					['Wenden'],
				'SharpLeft':
					['Scharf links abbiegen', ' auf {road}'],
				'Left':
					['Links abbiegen', ' auf {road}'],
				'SlightLeft':
					['Leicht links abbiegen', ' auf {road}'],
				'WaypointReached':
					['Zwischenhalt erreicht'],
				'Roundabout':
					['Nehmen Sie die {exitStr} Ausfahrt im Kreisverkehr', ' auf {road}'],
				'DestinationReached':
					['Sie haben ihr Ziel erreicht'],
				'Fork': ['An der Kreuzung {modifier}', ' auf {road}'],
				'Merge': ['Fahren Sie {modifier} weiter', ' auf {road}'],
				'OnRamp': ['Fahren Sie {modifier} auf die Auffahrt', ' auf {road}'],
				'OffRamp': ['Nehmen Sie die Ausfahrt {modifier}', ' auf {road}'],
				'EndOfRoad': ['Fahren Sie {modifier} am Ende der Straße', ' auf {road}'],
				'Onto': 'auf {road}'
			},
			formatOrder: function(n) {
				return n + '.';
			},
			ui: {
				startPlaceholder: 'Start',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'Ziel'
			}
		},

		'sv': {
			directions: {
				N: 'norr',
				NE: 'nordost',
				E: 'öst',
				SE: 'sydost',
				S: 'syd',
				SW: 'sydväst',
				W: 'väst',
				NW: 'nordväst',
				SlightRight: 'svagt höger',
				Right: 'höger',
				SharpRight: 'skarpt höger',
				SlightLeft: 'svagt vänster',
				Left: 'vänster',
				SharpLeft: 'skarpt vänster',
				Uturn: 'Vänd'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Åk åt {dir}', ' till {road}'],
				'Continue':
					['Fortsätt {dir}'],
				'SlightRight':
					['Svagt höger', ' till {road}'],
				'Right':
					['Sväng höger', ' till {road}'],
				'SharpRight':
					['Skarpt höger', ' till {road}'],
				'TurnAround':
					['Vänd'],
				'SharpLeft':
					['Skarpt vänster', ' till {road}'],
				'Left':
					['Sväng vänster', ' till {road}'],
				'SlightLeft':
					['Svagt vänster', ' till {road}'],
				'WaypointReached':
					['Viapunkt nådd'],
				'Roundabout':
					['Tag {exitStr} avfarten i rondellen', ' till {road}'],
				'DestinationReached':
					['Framme vid resans mål'],
				'Fork': ['Tag av {modifier}', ' till {road}'],
				'Merge': ['Anslut {modifier} ', ' till {road}'],
				'OnRamp': ['Tag påfarten {modifier}', ' till {road}'],
				'OffRamp': ['Tag avfarten {modifier}', ' till {road}'],
				'EndOfRoad': ['Sväng {modifier} vid vägens slut', ' till {road}'],
				'Onto': 'till {road}'
			},
			formatOrder: function(n) {
				return ['första', 'andra', 'tredje', 'fjärde', 'femte',
					'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'
					/* Can't possibly be more than ten exits, can there? */][n - 1];
			},
			ui: {
				startPlaceholder: 'Från',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'Till'
			}
		},

		'es': spanish,
		'sp': spanish,
		
		'nl': {
			directions: {
				N: 'noordelijke',
				NE: 'noordoostelijke',
				E: 'oostelijke',
				SE: 'zuidoostelijke',
				S: 'zuidelijke',
				SW: 'zuidewestelijke',
				W: 'westelijke',
				NW: 'noordwestelijke'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Vertrek in {dir} richting', ' de {road} op'],
				'Continue':
					['Ga in {dir} richting', ' de {road} op'],
				'SlightRight':
					['Volg de weg naar rechts', ' de {road} op'],
				'Right':
					['Ga rechtsaf', ' de {road} op'],
				'SharpRight':
					['Ga scherpe bocht naar rechts', ' de {road} op'],
				'TurnAround':
					['Keer om'],
				'SharpLeft':
					['Ga scherpe bocht naar links', ' de {road} op'],
				'Left':
					['Ga linksaf', ' de {road} op'],
				'SlightLeft':
					['Volg de weg naar links', ' de {road} op'],
				'WaypointReached':
					['Aangekomen bij tussenpunt'],
				'Roundabout':
					['Neem de {exitStr} afslag op de rotonde', ' de {road} op'],
				'DestinationReached':
					['Aangekomen op eindpunt'],
			},
			formatOrder: function(n) {
				if (n === 1 || n >= 20) {
					return n + 'ste';
				} else {
					return n + 'de';
				}
			},
			ui: {
				startPlaceholder: 'Vertrekpunt',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'Bestemming'
			}
		},
		'fr': {
			directions: {
				N: 'nord',
				NE: 'nord-est',
				E: 'est',
				SE: 'sud-est',
				S: 'sud',
				SW: 'sud-ouest',
				W: 'ouest',
				NW: 'nord-ouest'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Tout droit au {dir}', ' sur {road}'],
				'Continue':
					['Continuer au {dir}', ' sur {road}'],
				'SlightRight':
					['Légèrement à droite', ' sur {road}'],
				'Right':
					['A droite', ' sur {road}'],
				'SharpRight':
					['Complètement à droite', ' sur {road}'],
				'TurnAround':
					['Faire demi-tour'],
				'SharpLeft':
					['Complètement à gauche', ' sur {road}'],
				'Left':
					['A gauche', ' sur {road}'],
				'SlightLeft':
					['Légèrement à gauche', ' sur {road}'],
				'WaypointReached':
					['Point d\'étape atteint'],
				'Roundabout':
					['Au rond-point, prenez la {exitStr} sortie', ' sur {road}'],
				'DestinationReached':
					['Destination atteinte'],
			},
			formatOrder: function(n) {
				return n + 'º';
			},
			ui: {
				startPlaceholder: 'Départ',
				viaPlaceholder: 'Intermédiaire {viaNumber}',
				endPlaceholder: 'Arrivée'
			}
		},
		'it': {
			directions: {
				N: 'nord',
				NE: 'nord-est',
				E: 'est',
				SE: 'sud-est',
				S: 'sud',
				SW: 'sud-ovest',
				W: 'ovest',
				NW: 'nord-ovest'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Dritto verso {dir}', ' su {road}'],
				'Continue':
					['Continuare verso {dir}', ' su {road}'],
				'SlightRight':
					['Mantenere la destra', ' su {road}'],
				'Right':
					['A destra', ' su {road}'],
				'SharpRight':
					['Strettamente a destra', ' su {road}'],
				'TurnAround':
					['Fare inversione di marcia'],
				'SharpLeft':
					['Strettamente a sinistra', ' su {road}'],
				'Left':
					['A sinistra', ' sur {road}'],
				'SlightLeft':
					['Mantenere la sinistra', ' su {road}'],
				'WaypointReached':
					['Punto di passaggio raggiunto'],
				'Roundabout':
					['Alla rotonda, prendere la {exitStr} uscita'],
				'DestinationReached':
					['Destinazione raggiunta'],
			},
			formatOrder: function(n) {
				return n + 'º';
			},
			ui: {
				startPlaceholder: 'Partenza',
				viaPlaceholder: 'Intermedia {viaNumber}',
				endPlaceholder: 'Destinazione'
			}
		},
		'pt': {
			directions: {
				N: 'norte',
				NE: 'nordeste',
				E: 'leste',
				SE: 'sudeste',
				S: 'sul',
				SW: 'sudoeste',
				W: 'oeste',
				NW: 'noroeste',
				SlightRight: 'curva ligeira a direita',
				Right: 'direita',
				SharpRight: 'curva fechada a direita',
				SlightLeft: 'ligeira a esquerda',
				Left: 'esquerda',
				SharpLeft: 'curva fechada a esquerda',
				Uturn: 'Meia volta'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Siga {dir}', ' na {road}'],
				'Continue':
					['Continue {dir}', ' na {road}'],
				'SlightRight':
					['Curva ligeira a direita', ' na {road}'],
				'Right':
					['Curva a direita', ' na {road}'],
				'SharpRight':
					['Curva fechada a direita', ' na {road}'],
				'TurnAround':
					['Retorne'],
				'SharpLeft':
					['Curva fechada a esquerda', ' na {road}'],
				'Left':
					['Curva a esquerda', ' na {road}'],
				'SlightLeft':
					['Curva ligueira a esquerda', ' na {road}'],
				'WaypointReached':
					['Ponto de interesse atingido'],
				'Roundabout':
					['Pegue a {exitStr} saída na rotatória', ' na {road}'],
				'DestinationReached':
					['Destino atingido'],
				'Fork': ['Na encruzilhada, vire a {modifier}', ' na {road}'],
				'Merge': ['Entre à {modifier}', ' na {road}'],
				'OnRamp': ['Vire {modifier} na rampa', ' na {road}'],
				'OffRamp': ['Entre na rampa na {modifier}', ' na {road}'],
				'EndOfRoad': ['Vire {modifier} no fim da rua', ' na {road}'],
				'Onto': 'na {road}'
			},
			formatOrder: function(n) {
				return n + 'º';
			},
			ui: {
				startPlaceholder: 'Origem',
				viaPlaceholder: 'Intermédio {viaNumber}',
				endPlaceholder: 'Destino'
			}
		},
		'sk': {
			directions: {
				N: 'sever',
				NE: 'serverovýchod',
				E: 'východ',
				SE: 'juhovýchod',
				S: 'juh',
				SW: 'juhozápad',
				W: 'západ',
				NW: 'serverozápad'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Mierte na {dir}', ' na {road}'],
				'Continue':
					['Pokračujte na {dir}', ' na {road}'],
				'SlightRight':
					['Mierne doprava', ' na {road}'],
				'Right':
					['Doprava', ' na {road}'],
				'SharpRight':
					['Prudko doprava', ' na {road}'],
				'TurnAround':
					['Otočte sa'],
				'SharpLeft':
					['Prudko doľava', ' na {road}'],
				'Left':
					['Doľava', ' na {road}'],
				'SlightLeft':
					['Mierne doľava', ' na {road}'],
				'WaypointReached':
					['Ste v prejazdovom bode.'],
				'Roundabout':
					['Odbočte na {exitStr} výjazde', ' na {road}'],
				'DestinationReached':
					['Prišli ste do cieľa.'],
			},
			formatOrder: function(n) {
				var i = n % 10 - 1,
				suffix = ['.', '.', '.'];

				return suffix[i] ? n + suffix[i] : n + '.';
			},
			ui: {
				startPlaceholder: 'Začiatok',
				viaPlaceholder: 'Cez {viaNumber}',
				endPlaceholder: 'Koniec'
			}
		},
		'el': {
			directions: {
				N: 'βόρεια',
				NE: 'βορειοανατολικά',
				E: 'ανατολικά',
				SE: 'νοτιοανατολικά',
				S: 'νότια',
				SW: 'νοτιοδυτικά',
				W: 'δυτικά',
				NW: 'βορειοδυτικά'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Κατευθυνθείτε {dir}', ' στην {road}'],
				'Continue':
					['Συνεχίστε {dir}', ' στην {road}'],
				'SlightRight':
					['Ελαφρώς δεξιά', ' στην {road}'],
				'Right':
					['Δεξιά', ' στην {road}'],
				'SharpRight':
					['Απότομη δεξιά στροφή', ' στην {road}'],
				'TurnAround':
					['Κάντε αναστροφή'],
				'SharpLeft':
					['Απότομη αριστερή στροφή', ' στην {road}'],
				'Left':
					['Αριστερά', ' στην {road}'],
				'SlightLeft':
					['Ελαφρώς αριστερά', ' στην {road}'],
				'WaypointReached':
					['Φτάσατε στο σημείο αναφοράς'],
				'Roundabout':
					['Ακολουθήστε την {exitStr} έξοδο στο κυκλικό κόμβο', ' στην {road}'],
				'DestinationReached':
					['Φτάσατε στον προορισμό σας'],
			},
			formatOrder: function(n) {
				return n + 'º';
			},
			ui: {
				startPlaceholder: 'Αφετηρία',
				viaPlaceholder: 'μέσω {viaNumber}',
				endPlaceholder: 'Προορισμός'
			}
		},
		'ca': {
			directions: {
				N: 'nord',
				NE: 'nord-est',
				E: 'est',
				SE: 'sud-est',
				S: 'sud',
				SW: 'sud-oest',
				W: 'oest',
				NW: 'nord-oest',
				SlightRight: 'lleu gir a la dreta',
				Right: 'dreta',
				SharpRight: 'gir pronunciat a la dreta',
				SlightLeft: 'gir pronunciat a l\'esquerra',
				Left: 'esquerra',
				SharpLeft: 'lleu gir a l\'esquerra',
				Uturn: 'mitja volta'
			},
			instructions: {
				'Head':
					['Recte {dir}', ' sobre {road}'],
				'Continue':
					['Continuar {dir}'],
				'TurnAround':
					['Donar la volta'],
				'WaypointReached':
					['Ha arribat a un punt del camí'],
				'Roundabout':
					['Agafar {exitStr} sortida a la rotonda', ' a {road}'],
				'DestinationReached':
					['Arribada al destí'],
				'Fork': ['A la cruïlla gira a la {modifier}', ' cap a {road}'],
				'Merge': ['Incorpora\'t {modifier}', ' a {road}'],
				'OnRamp': ['Gira {modifier} a la sortida', ' cap a {road}'],
				'OffRamp': ['Pren la sortida {modifier}', ' cap a {road}'],
				'EndOfRoad': ['Gira {modifier} al final de la carretera', ' cap a {road}'],
				'Onto': 'cap a {road}'
			},
			formatOrder: function(n) {
				return n + 'º';
			},
			ui: {
				startPlaceholder: 'Origen',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'Destí'
			},
			units: {
				meters: 'm',
				kilometers: 'km',
				yards: 'yd',
				miles: 'mi',
				hours: 'h',
				minutes: 'min',
				seconds: 's'
			}
		},
		'ru': {
			directions: {
				N: 'север',
				NE: 'северовосток',
				E: 'восток',
				SE: 'юговосток',
				S: 'юг',
				SW: 'югозапад',
				W: 'запад',
				NW: 'северозапад',
				SlightRight: 'плавно направо',
				Right: 'направо',
				SharpRight: 'резко направо',
				SlightLeft: 'плавно налево',
				Left: 'налево',
				SharpLeft: 'резко налево',
				Uturn: 'развернуться'
			},
			instructions: {
				'Head':
					['Начать движение на {dir}', ' по {road}'],
				'Continue':
					['Продолжать движение на {dir}', ' по {road}'],
				'SlightRight':
					['Плавный поворот направо', ' на {road}'],
				'Right':
					['Направо', ' на {road}'],
				'SharpRight':
					['Резкий поворот направо', ' на {road}'],
				'TurnAround':
					['Развернуться'],
				'SharpLeft':
					['Резкий поворот налево', ' на {road}'],
				'Left':
					['Поворот налево', ' на {road}'],
				'SlightLeft':
					['Плавный поворот налево', ' на {road}'],
				'WaypointReached':
					['Точка достигнута'],
				'Roundabout':
					['{exitStr} съезд с кольца', ' на {road}'],
				'DestinationReached':
					['Окончание маршрута'],
				'Fork': ['На развилке поверните {modifier}', ' на {road}'],
				'Merge': ['Перестройтесь {modifier}', ' на {road}'],
				'OnRamp': ['Поверните {modifier} на съезд', ' на {road}'],
				'OffRamp': ['Съезжайте на {modifier}', ' на {road}'],
				'EndOfRoad': ['Поверните {modifier} в конце дороги', ' на {road}'],
				'Onto': 'на {road}'
			},
			formatOrder: function(n) {
				return n + '-й';
			},
			ui: {
				startPlaceholder: 'Начало',
				viaPlaceholder: 'Через {viaNumber}',
				endPlaceholder: 'Конец'
			},
			units: {
				meters: 'м',
				kilometers: 'км',
				yards: 'ярд',
				miles: 'ми',
				hours: 'ч',
				minutes: 'м',
				seconds: 'с'
			}
		},
                
                'pl': {
			directions: {
				N: 'północ',
				NE: 'północny wschód',
				E: 'wschód',
				SE: 'południowy wschód',
				S: 'południe',
				SW: 'południowy zachód',
				W: 'zachód',
				NW: 'północny zachód',
				SlightRight: 'lekko w prawo',
				Right: 'w prawo',
				SharpRight: 'ostro w prawo',
				SlightLeft: 'lekko w lewo',
				Left: 'w lewo',
				SharpLeft: 'ostro w lewo',
				Uturn: 'zawróć'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Kieruj się na {dir}', ' na {road}'],
				'Continue':
					['Jedź dalej przez {dir}'],
				'TurnAround':
					['Zawróć'],
				'WaypointReached':
					['Punkt pośredni'],
				'Roundabout':
					['Wyjedź {exitStr} zjazdem na rondzie', ' na {road}'],
				'DestinationReached':
					['Dojechano do miejsca docelowego'],
				'Fork': ['Na rozwidleniu {modifier}', ' na {road}'],
				'Merge': ['Zjedź {modifier}', ' na {road}'],
				'OnRamp': ['Wjazd {modifier}', ' na {road}'],
				'OffRamp': ['Zjazd {modifier}', ' na {road}'],
				'EndOfRoad': ['Skręć {modifier} na końcu drogi', ' na {road}'],
				'Onto': 'na {road}'
			},
			formatOrder: function(n) {
				return n + '.';
			},
			ui: {
				startPlaceholder: 'Początek',
				viaPlaceholder: 'Przez {viaNumber}',
				endPlaceholder: 'Koniec'
			},
			units: {
				meters: 'm',
				kilometers: 'km',
				yards: 'yd',
				miles: 'mi',
				hours: 'godz',
				minutes: 'min',
				seconds: 's'
			}
		},
		'uk': {
			directions: {
				N: 'північ',
				NE: 'північний схід',
				E: 'схід',
				SE: 'південний схід',
				S: 'південь',
				SW: 'південний захід',
				W: 'захід',
				NW: 'північний захід',
				SlightRight: 'плавно направо',
				Right: 'направо',
				SharpRight: 'різко направо',
				SlightLeft: 'плавно наліво',
				Left: 'наліво',
				SharpLeft: 'різко наліво',
				Uturn: 'розвернутися',
			},
			instructions: {
				'Head':
					[ 'Почати рух на {dir}', 'по {road}'],
				'Continue':
					[ 'Продовжувати рух на {dir}', 'по {road}'],
				'SlightRight':
					[ 'Плавний поворот направо', 'на {road}'],
				'Right':
					[ 'Направо', 'на {road}'],
				'SharpRight':
					[ 'Різкий поворот направо', 'на {road}'],
				'TurnAround':
					[ 'Розгорнутися'],
				'SharpLeft':
					[ 'Різкий поворот наліво', 'на {road}'],
				'Left':
					[ 'Поворот наліво', 'на {road}'],
				'SlightLeft':
					[ 'Плавний поворот наліво', 'на {road}'],
				'WaypointReached':
					[ 'Точка досягнута'],
				'Roundabout':
					[ "{ExitStr} з'їзд з кільця", 'на {road}'],
				'DestinationReached':
					[ 'Закінчення маршруту'],
				'Fork': [ 'На розвилці поверніть {modifier}', 'на {road}'],
				'Merge': [ 'Візьміть {modifier}', 'на {road}'],
				'OnRamp': [ "Поверніть {modifier} на з'їзд", 'на {road}'],
				'OffRamp': [ "З'їжджайте на {modifier}", 'на {road}'],
				'EndOfRoad': [ 'Поверніть {modifier} в кінці дороги', 'на {road}'],
				'Onto': 'на {road}'
			},
			formatOrder: function(n) {
				return n + '-й';
			},
			ui: {
				startPlaceholder: 'Початок',
				viaPlaceholder: 'Через {viaNumber}',
				endPlaceholder: 'Кінець'
			},
			units: {
				meters: 'м',
				kilometers: 'км',
				yards: 'ярд',
				miles: 'ми',
				hours: 'г',
				minutes: 'хв',
				seconds: 'сек'
			}
		}
	});
})();

},{}],13:[function(_dereq_,module,exports){
/* localization_simple.js: simplest form - just de/en as I will only use those
 * Thursday, 30-Dec-21 06:56:41 UTC
 */
/* 
   NOTICE
   Since version 3.2.5, the functionality in this file is by
   default NOT used for localizing OSRM instructions.
   Instead, we rely on the module osrm-text-instructions (https://github.com/Project-OSRM/osrm-text-instructions/).
   
   This file can still be used for other routing backends, or if you specify the
   stepToText option in the OSRMv1 class.
*/

(function() {
	'use strict';

	L.Routing = L.Routing || {};

	var Localization = L.Class.extend({
		initialize: function(langs) {
			this._langs = L.Util.isArray(langs) ? langs.slice() : [langs, 'en'];

			for (var i = 0, l = this._langs.length; i < l; i++) {
				var generalizedCode = /([A-Za-z]+)/.exec(this._langs[i])[1]
				if (!Localization[this._langs[i]]) {
					if (Localization[generalizedCode]) {
						this._langs[i] = generalizedCode;
					} else {
						throw new Error('No localization for language "' + this._langs[i] + '".');
					}
				}
			}
		},

		localize: function(keys) {
			var dict,
				key,
				value;

			keys = L.Util.isArray(keys) ? keys : [keys];

			for (var i = 0, l = this._langs.length; i < l; i++) {
				dict = Localization[this._langs[i]];
				for (var j = 0, nKeys = keys.length; dict && j < nKeys; j++) {
					key = keys[j];
					value = dict[key];
					dict = value;
				}

				if (value) {
					return value;
				}
			}
		}
	});

	module.exports = L.extend(Localization, {
		'en': {
			directions: {
				N: 'north',
				NE: 'northeast',
				E: 'east',
				SE: 'southeast',
				S: 'south',
				SW: 'southwest',
				W: 'west',
				NW: 'northwest',
				SlightRight: 'slight right',
				Right: 'right',
				SharpRight: 'sharp right',
				SlightLeft: 'slight left',
				Left: 'left',
				SharpLeft: 'sharp left',
				Uturn: 'Turn around'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Head {dir}', ' on {road}'],
				'Continue':
					['Continue {dir}'],
				'TurnAround':
					['Turn around'],
				'WaypointReached':
					['Waypoint reached'],
				'Roundabout':
					['Take the {exitStr} exit in the roundabout', ' onto {road}'],
				'DestinationReached':
					['Destination reached'],
				'Fork': ['At the fork, turn {modifier}', ' onto {road}'],
				'Merge': ['Merge {modifier}', ' onto {road}'],
				'OnRamp': ['Turn {modifier} on the ramp', ' onto {road}'],
				'OffRamp': ['Take the ramp on the {modifier}', ' onto {road}'],
				'EndOfRoad': ['Turn {modifier} at the end of the road', ' onto {road}'],
				'Onto': 'onto {road}'
			},
			formatOrder: function(n) {
				var i = n % 10 - 1,
				suffix = ['st', 'nd', 'rd'];

				return suffix[i] ? n + suffix[i] : n + 'th';
			},
			ui: {
				startPlaceholder: 'Start',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'End',
				exclude: 'Exclude',
				ferry: 'ferries',
				toll: 'toll roads',
				motorway: 'motorways'
			},
			units: {
				meters: 'm',
				kilometers: 'km',
				yards: 'yd',
				miles: 'mi',
				hours: 'h',
				minutes: 'min',
				seconds: 's'
			}
		},

		'de': {
			directions: {
				N: 'Norden',
				NE: 'Nordosten',
				E: 'Osten',
				SE: 'Südosten',
				S: 'Süden',
				SW: 'Südwesten',
				W: 'Westen',
				NW: 'Nordwesten',
				SlightRight: 'leicht rechts',
				Right: 'rechts',
				SharpRight: 'scharf rechts',
				SlightLeft: 'leicht links',
				Left: 'links',
				SharpLeft: 'scharf links',
				Uturn: 'Wenden'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Richtung {dir}', ' auf {road}'],
				'Continue':
					['Geradeaus Richtung {dir}', ' auf {road}'],
				'SlightRight':
					['Leicht rechts abbiegen', ' auf {road}'],
				'Right':
					['Rechts abbiegen', ' auf {road}'],
				'SharpRight':
					['Scharf rechts abbiegen', ' auf {road}'],
				'TurnAround':
					['Wenden'],
				'SharpLeft':
					['Scharf links abbiegen', ' auf {road}'],
				'Left':
					['Links abbiegen', ' auf {road}'],
				'SlightLeft':
					['Leicht links abbiegen', ' auf {road}'],
				'WaypointReached':
					['Zwischenhalt erreicht'],
				'Roundabout':
					['Nehmen Sie die {exitStr} Ausfahrt im Kreisverkehr', ' auf {road}'],
				'DestinationReached':
					['Sie haben ihr Ziel erreicht'],
				'Fork': ['An der Kreuzung {modifier}', ' auf {road}'],
				'Merge': ['Fahren Sie {modifier} weiter', ' auf {road}'],
				'OnRamp': ['Fahren Sie {modifier} auf die Auffahrt', ' auf {road}'],
				'OffRamp': ['Nehmen Sie die Ausfahrt {modifier}', ' auf {road}'],
				'EndOfRoad': ['Fahren Sie {modifier} am Ende der Straße', ' auf {road}'],
				'Onto': 'auf {road}'
			},
			formatOrder: function(n) {
				return n + '.';
			},
			ui: {
				startPlaceholder: 'Start',
				viaPlaceholder: 'Via {viaNumber}',
				endPlaceholder: 'Ziel',
				exclude: 'Vermeide',
				ferry: 'Fähren',
				toll: 'Mautstraßen',
				motorway: 'Autobahnen'
			}
		}

	});
})();

},{}],14:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	var OSRMv1 = _dereq_('./osrm-v1');

	/**
	 * Works against OSRM's new API in version 5.0; this has
	 * the API version v1.
	 */
	module.exports = OSRMv1.extend({
		options: {
			serviceUrl: 'https://api.mapbox.com/directions/v5',
			profile: 'mapbox/driving',
			useHints: false
		},

		initialize: function(accessToken, options) {
			L.Routing.OSRMv1.prototype.initialize.call(this, options);
			this.options.requestParameters = this.options.requestParameters || {};
			/* jshint camelcase: false */
			this.options.requestParameters.access_token = accessToken;
			/* jshint camelcase: true */
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./osrm-v1":15}],15:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null),
		corslite = _dereq_('@mapbox/corslite'),
		polyline = _dereq_('@mapbox/polyline'),
		osrmTextInstructions = _dereq_('osrm-text-instructions-light-de-en')('v5');

	// Ignore camelcase naming for this file, since OSRM's API uses
	// underscores.
	/* jshint camelcase: false */

	var Waypoint = _dereq_('./waypoint');

	/**
	 * Works against OSRM's new API in version 5.0; this has
	 * the API version v1.
	 */
	module.exports = L.Class.extend({
		options: {
			serviceUrl: 'https://router.project-osrm.org/route/v1',
			profile: 'driving',
			timeout: 30 * 1000,
			routingOptions: {
				alternatives: true,
				steps: true,
				excludeOpts: ''
			},
			polylinePrecision: 5,
			useHints: true,
			suppressDemoServerWarning: false,
			stepToText: false,
			language: 'en'
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);
			this._hints = {
				locations: {}
			};

			if (!this.options.suppressDemoServerWarning &&
				this.options.serviceUrl.indexOf('//router.project-osrm.org') >= 0) {
				console.warn('You are using OSRM\'s demo server. ' +
					'Please note that it is **NOT SUITABLE FOR PRODUCTION USE**.\n' +
					'Refer to the demo server\'s usage policy: ' +
					'https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy\n\n' +
					'To change, set the serviceUrl option.\n\n' +
					'Please do not report issues with this server to neither ' +
					'Leaflet Routing Machine or OSRM - it\'s for\n' +
					'demo only, and will sometimes not be available, or work in ' +
					'unexpected ways.\n\n' +
					'Please set up your own OSRM server, or use a paid service ' +
					'provider for production.');
			}
		},
		
		/* update option holding the string containing the classes to
		 * exclude when routing: classString is
		 * 'exclude=ferry,toll,motorway' or any combination of the classes
		 */
		setExclude: function(classString) {
                        this.options.routingOptions.excludeOpts = classString;
                        // console.log(this.options.routingOptions);
                },

		route: function(waypoints, callback, context, options) {
			var timedOut = false,
				wps = [],
				url,
				timer,
				wp,
				i,
				xhr;

			options = L.extend({}, this.options.routingOptions, options);
			url = this.buildRouteUrl(waypoints, options);
			if (this.options.requestParameters) {
				url += L.Util.getParamString(this.options.requestParameters, url);
			}

			timer = setTimeout(function() {
				timedOut = true;
				callback.call(context || callback, {
					status: -1,
					message: 'OSRM request timed out.'
				});
			}, this.options.timeout);

			// Create a copy of the waypoints, since they
			// might otherwise be asynchronously modified while
			// the request is being processed.
			for (i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				wps.push(new Waypoint(wp.latLng, wp.name, wp.options));
			}

			return xhr = corslite(url, L.bind(function(err, resp) {
				var data,
					error =  {};

				clearTimeout(timer);
				if (!timedOut) {
					if (!err) {
						try {
							data = JSON.parse(resp.responseText);
							try {
								return this._routeDone(data, wps, options, callback, context);
							} catch (ex) {
								error.status = -3;
								error.message = ex.toString();
							}
						} catch (ex) {
							error.status = -2;
							error.message = 'Error parsing OSRM response: ' + ex.toString();
						}
					} else {
						var message = err.type + (err.target && err.target.status ? ' HTTP ' + err.target.status + ': ' + err.target.statusText : '');
						if (err.responseText) {
							try {
								data = JSON.parse(err.responseText);
								if (data.message)
									message = data.message;
							} catch (ex) {
							}
						}
						error.message = 'HTTP request failed: ' + message;
						error.url = url;
						error.status = -1;
						error.target = err;
					}

					callback.call(context || callback, error);
				} else {
					xhr.abort();
				}
			}, this));
		},

		requiresMoreDetail: function(route, zoom, bounds) {
			if (!route.properties.isSimplified) {
				return false;
			}

			var waypoints = route.inputWaypoints,
				i;
			for (i = 0; i < waypoints.length; ++i) {
				if (!bounds.contains(waypoints[i].latLng)) {
					return true;
				}
			}

			return false;
		},

		_routeDone: function(response, inputWaypoints, options, callback, context) {
			var alts = [],
			    actualWaypoints,
			    i,
			    route;

			context = context || callback;
			if (response.code !== 'Ok') {
				callback.call(context, {
					status: response.code
				});
				return;
			}

			actualWaypoints = this._toWaypoints(inputWaypoints, response.waypoints);

			for (i = 0; i < response.routes.length; i++) {
				route = this._convertRoute(response.routes[i]);
				route.inputWaypoints = inputWaypoints;
				route.waypoints = actualWaypoints;
				route.properties = {isSimplified: !options || !options.geometryOnly || options.simplifyGeometry};
				alts.push(route);
			}

			this._saveHintData(response.waypoints, inputWaypoints);

			callback.call(context, null, alts);
		},

		_convertRoute: function(responseRoute) {
			var result = {
					name: '',
					coordinates: [],
					instructions: [],
					summary: {
						totalDistance: responseRoute.distance,
						totalTime: responseRoute.duration
					}
				},
				legNames = [],
				waypointIndices = [],
				index = 0,
				legCount = responseRoute.legs.length,
				hasSteps = responseRoute.legs[0].steps.length > 0,
				i,
				j,
				leg,
				step,
				geometry,
				type,
				modifier,
				text,
				stepToText;

			if (this.options.stepToText) {
				stepToText = this.options.stepToText;
			} else {
				stepToText = L.bind(osrmTextInstructions.compile, osrmTextInstructions, this.options.language);
			}

			for (i = 0; i < legCount; i++) {
				leg = responseRoute.legs[i];
				legNames.push(leg.summary && leg.summary.charAt(0).toUpperCase() + leg.summary.substring(1));
				for (j = 0; j < leg.steps.length; j++) {
					step = leg.steps[j];
					geometry = this._decodePolyline(step.geometry);
					result.coordinates.push.apply(result.coordinates, geometry);
					type = this._maneuverToInstructionType(step.maneuver, i === legCount - 1);
					modifier = this._maneuverToModifier(step.maneuver);
					text = stepToText(step, {legCount: legCount, legIndex: i});

					if (type) {
						if ((i == 0 && step.maneuver.type == 'depart') || step.maneuver.type == 'arrive') {
							waypointIndices.push(index);
						}

						result.instructions.push({
							type: type,
							distance: step.distance,
							time: step.duration,
							road: step.name,
							direction: this._bearingToDirection(step.maneuver.bearing_after),
							exit: step.maneuver.exit,
							index: index,
							mode: step.mode,
							modifier: modifier,
							text: text
						});
					}

					index += geometry.length;
				}
			}

			result.name = legNames.join(', ');
			if (!hasSteps) {
				result.coordinates = this._decodePolyline(responseRoute.geometry);
			} else {
				result.waypointIndices = waypointIndices;
			}

			return result;
		},

		_bearingToDirection: function(bearing) {
			var oct = Math.round(bearing / 45) % 8;
			return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][oct];
		},

		_maneuverToInstructionType: function(maneuver, lastLeg) {
			switch (maneuver.type) {
			case 'new name':
				return 'Continue';
			case 'depart':
				return 'Head';
			case 'arrive':
				return lastLeg ? 'DestinationReached' : 'WaypointReached';
			case 'roundabout':
			case 'rotary':
				return 'Roundabout';
			case 'merge':
			case 'fork':
			case 'on ramp':
			case 'off ramp':
			case 'end of road':
				return this._camelCase(maneuver.type);
			// These are all reduced to the same instruction in the current model
			//case 'turn':
			//case 'ramp': // deprecated in v5.1
			default:
				return this._camelCase(maneuver.modifier);
			}
		},

		_maneuverToModifier: function(maneuver) {
			var modifier = maneuver.modifier;

			switch (maneuver.type) {
			case 'merge':
			case 'fork':
			case 'on ramp':
			case 'off ramp':
			case 'end of road':
				modifier = this._leftOrRight(modifier);
			}

			return modifier && this._camelCase(modifier);
		},

		_camelCase: function(s) {
			var words = s.split(' '),
				result = '';
			for (var i = 0, l = words.length; i < l; i++) {
				result += words[i].charAt(0).toUpperCase() + words[i].substring(1);
			}

			return result;
		},

		_leftOrRight: function(d) {
			return d.indexOf('left') >= 0 ? 'Left' : 'Right';
		},

		_decodePolyline: function(routeGeometry) {
			var cs = polyline.decode(routeGeometry, this.options.polylinePrecision),
				result = new Array(cs.length),
				i;
			for (i = cs.length - 1; i >= 0; i--) {
				result[i] = L.latLng(cs[i]);
			}

			return result;
		},

		_toWaypoints: function(inputWaypoints, vias) {
			var wps = [],
			    i,
			    viaLoc;
			for (i = 0; i < vias.length; i++) {
				viaLoc = vias[i].location;
				wps.push(new Waypoint(L.latLng(viaLoc[1], viaLoc[0]),
				                            inputWaypoints[i].name,
											inputWaypoints[i].options));
			}

			return wps;
		},

		buildRouteUrl: function(waypoints, options) {
			var locs = [],
				hints = [],
				wp,
				latLng,
			    computeInstructions,
			    computeAlternative = true;

			for (var i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				latLng = wp.latLng;
				locs.push(latLng.lng + ',' + latLng.lat);
				hints.push(this._hints.locations[this._locationKey(latLng)] || '');
			}

			computeInstructions =
				true;

			return this.options.serviceUrl + '/' + this.options.profile + '/' +
				locs.join(';') + '?' +
				(options.geometryOnly ? (options.simplifyGeometry ? '' : 'overview=full') : 'overview=false') +
				'&alternatives=' + computeAlternative.toString() +
				'&steps=' + computeInstructions.toString() +
				this.options.routingOptions.excludeOpts +
				(this.options.useHints ? '&hints=' + hints.join(';') : '') +
				(options.allowUTurns ? '&continue_straight=' + !options.allowUTurns : '');
		},

		_locationKey: function(location) {
			return location.lat + ',' + location.lng;
		},

		_saveHintData: function(actualWaypoints, waypoints) {
			var loc;
			this._hints = {
				locations: {}
			};
			for (var i = actualWaypoints.length - 1; i >= 0; i--) {
				loc = waypoints[i].latLng;
				this._hints.locations[this._locationKey(loc)] = actualWaypoints[i].hint;
			}
		},
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./waypoint":17,"@mapbox/corslite":1,"@mapbox/polyline":2,"osrm-text-instructions-light-de-en":18}],16:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);
	var GeocoderElement = _dereq_('./geocoder-element');
	var Waypoint = _dereq_('./waypoint');

	module.exports = (L.Layer || L.Class).extend({
		includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

		options: {
			dragStyles: [
				{color: 'black', opacity: 0.15, weight: 9},
				{color: 'white', opacity: 0.8, weight: 6},
				{color: 'red', opacity: 1, weight: 2, dashArray: '7,12'}
			],
			draggableWaypoints: true,
			routeWhileDragging: false,
			addWaypoints: true,
			reverseWaypoints: false,
			addButtonClassName: '',
			language: 'en',
			createGeocoderElement: function(wp, i, nWps, plan) {
				return new GeocoderElement(wp, i, nWps, plan);
			},
			createMarker: function(i, wp) {
				var options = {
						draggable: this.draggableWaypoints
					},
				    marker = L.marker(wp.latLng, options);

				return marker;
			},
			geocodersClassName: ''
		},

		initialize: function(waypoints, options) {
			L.Util.setOptions(this, options);
			this._waypoints = [];
			this.setWaypoints(waypoints);
		},

		isReady: function() {
			var i;
			for (i = 0; i < this._waypoints.length; i++) {
				if (!this._waypoints[i].latLng) {
					return false;
				}
			}

			return true;
		},

		getWaypoints: function() {
			var i,
				wps = [];

			for (i = 0; i < this._waypoints.length; i++) {
				wps.push(this._waypoints[i]);
			}

			return wps;
		},

		setWaypoints: function(waypoints) {
			var args = [0, this._waypoints.length].concat(waypoints);
			this.spliceWaypoints.apply(this, args);
			return this;
		},

		spliceWaypoints: function() {
			var args = [arguments[0], arguments[1]],
			    i;

			for (i = 2; i < arguments.length; i++) {
				args.push(arguments[i] && arguments[i].hasOwnProperty('latLng') ? arguments[i] : new Waypoint(arguments[i]));
			}

			[].splice.apply(this._waypoints, args);

			// Make sure there's always at least two waypoints
			while (this._waypoints.length < 2) {
				this.spliceWaypoints(this._waypoints.length, 0, null);
			}

			this._updateMarkers();
			this._fireChanged.apply(this, args);
		},

		onAdd: function(map) {
			this._map = map;
			this._updateMarkers();
		},

		onRemove: function() {
			var i;
			this._removeMarkers();

			if (this._newWp) {
				for (i = 0; i < this._newWp.lines.length; i++) {
					this._map.removeLayer(this._newWp.lines[i]);
				}
			}

			delete this._map;
		},

		createGeocoders: function() {
			var container = L.DomUtil.create('div', 'leaflet-routing-geocoders ' + this.options.geocodersClassName),
				waypoints = this._waypoints,
			    addWpBtn,
			    reverseBtn;
			
			/* append a new div after the geocoding inputs holding the checkboxes */
			var cb= L.DomUtil.create('div', 'leaflet-routing-oeoptions', container);
                        cb.innerHTML = 'Exclude:<br>';
                        var l;
                        l = L.DomUtil.create('label', 'leaflet-routing-exlbl', cb);
                        l.innerHTML = 'ferries';                 
                        var fer = L.DomUtil.create('input', 'leaflet-routing-exclude', cb);
                        fer.type = 'checkbox';
                        l = L.DomUtil.create('label', 'leaflet-routing-exlbl', cb);
                        l.innerHTML = 'toll';            
                        var tol = L.DomUtil.create('input', 'leaflet-routing-exclude', cb);
                        tol.type = 'checkbox';
                        l = L.DomUtil.create('label', 'leaflet-routing-exlbl', cb);
                        l.innerHTML = 'motorways';               
                        var mot = L.DomUtil.create('input', 'leaflet-routing-exclude', cb);
                        mot.type = 'checkbox';
			
			/* construct the parameter string used in the routing query, set
			 * option and fire a changed event to calculate a new route */
                        function buildExclude(that) {
                                var exclude = '',
                                    extmp = '';

                                if (fer.checked) extmp = 'ferry';
                                if (tol.checked) extmp += extmp !== '' ? ',toll' : 'toll';
                                if (mot.checked) extmp += extmp !== '' ? ',motorway' : 'motorway';
                                if (extmp !== '') exclude = '&exclude=' + extmp;
                                
                                that.options.router.setExclude(exclude);
                                that._fireChanged(); 

                                return exclude;
                        }
                        
                        L.DomEvent.addListener(fer, 'change', function(){ buildExclude(this); }, this);
                        L.DomEvent.addListener(tol, 'change', function(){ buildExclude(this); }, this);
                        L.DomEvent.addListener(mot, 'change', function(){ buildExclude(this); }, this);

			this._geocoderContainer = container;
			this._geocoderElems = [];


			if (this.options.addWaypoints) {
				addWpBtn = L.DomUtil.create('button', 'leaflet-routing-add-waypoint ' + this.options.addButtonClassName, container);
				addWpBtn.setAttribute('type', 'button');
				L.DomEvent.addListener(addWpBtn, 'click', function() {
					this.spliceWaypoints(waypoints.length, 0, null);
				}, this);
			}

			if (this.options.reverseWaypoints) {
				reverseBtn = L.DomUtil.create('button', 'leaflet-routing-reverse-waypoints', container);
				reverseBtn.setAttribute('type', 'button');
				L.DomEvent.addListener(reverseBtn, 'click', function() {
					this._waypoints.reverse();
					this.setWaypoints(this._waypoints);
				}, this);
			}

			this._updateGeocoders();
			this.on('waypointsspliced', this._updateGeocoders);

			return container;
		},

		_createGeocoder: function(i) {
			var geocoder = this.options.createGeocoderElement(this._waypoints[i], i, this._waypoints.length, this.options);
			geocoder
			.on('delete', function() {
				if (i > 0 || this._waypoints.length > 2) {
					this.spliceWaypoints(i, 1);
				} else {
					this.spliceWaypoints(i, 1, new Waypoint());
				}
			}, this)
			.on('geocoded', function(e) {
				this._updateMarkers();
				this._fireChanged();
				this._focusGeocoder(i + 1);
				this.fire('waypointgeocoded', {
					waypointIndex: i,
					waypoint: e.waypoint
				});
			}, this)
			.on('reversegeocoded', function(e) {
				this.fire('waypointgeocoded', {
					waypointIndex: i,
					waypoint: e.waypoint
				});
			}, this);

			return geocoder;
		},

		_updateGeocoders: function() {
			var elems = [],
				i,
			    geocoderElem;

			for (i = 0; i < this._geocoderElems.length; i++) {
				this._geocoderContainer.removeChild(this._geocoderElems[i].getContainer());
			}

			for (i = this._waypoints.length - 1; i >= 0; i--) {
				geocoderElem = this._createGeocoder(i);
				this._geocoderContainer.insertBefore(geocoderElem.getContainer(), this._geocoderContainer.firstChild);
				elems.push(geocoderElem);
			}

			this._geocoderElems = elems.reverse();
		},

		_removeMarkers: function() {
			var i;
			if (this._markers) {
				for (i = 0; i < this._markers.length; i++) {
					if (this._markers[i]) {
						this._map.removeLayer(this._markers[i]);
					}
				}
			}
			this._markers = [];
		},

		_updateMarkers: function() {
			var i,
			    m;

			if (!this._map) {
				return;
			}

			this._removeMarkers();

			for (i = 0; i < this._waypoints.length; i++) {
				if (this._waypoints[i].latLng) {
					m = this.options.createMarker(i, this._waypoints[i], this._waypoints.length);
					if (m) {
						m.addTo(this._map);
						if (this.options.draggableWaypoints) {
							this._hookWaypointEvents(m, i);
						}
					}
				} else {
					m = null;
				}
				this._markers.push(m);
			}
		},

		_fireChanged: function() {
			this.fire('waypointschanged', {waypoints: this.getWaypoints()});

			if (arguments.length >= 2) {
				this.fire('waypointsspliced', {
					index: Array.prototype.shift.call(arguments),
					nRemoved: Array.prototype.shift.call(arguments),
					added: arguments
				});
			}
		},

		_hookWaypointEvents: function(m, i, trackMouseMove) {
			var eventLatLng = function(e) {
					return trackMouseMove ? e.latlng : e.target.getLatLng();
				},
				dragStart = L.bind(function(e) {
					this.fire('waypointdragstart', {index: i, latlng: eventLatLng(e)});
				}, this),
				drag = L.bind(function(e) {
					this._waypoints[i].latLng = eventLatLng(e);
					this.fire('waypointdrag', {index: i, latlng: eventLatLng(e)});
				}, this),
				dragEnd = L.bind(function(e) {
					this._waypoints[i].latLng = eventLatLng(e);
					this._waypoints[i].name = '';
					if (this._geocoderElems) {
						this._geocoderElems[i].update(true);
					}
					this.fire('waypointdragend', {index: i, latlng: eventLatLng(e)});
					this._fireChanged();
				}, this),
				mouseMove,
				mouseUp;

			if (trackMouseMove) {
				mouseMove = L.bind(function(e) {
					this._markers[i].setLatLng(e.latlng);
					drag(e);
				}, this);
				mouseUp = L.bind(function(e) {
					this._map.dragging.enable();
					this._map.off('mouseup', mouseUp);
					this._map.off('mousemove', mouseMove);
					dragEnd(e);
				}, this);
				this._map.dragging.disable();
				this._map.on('mousemove', mouseMove);
				this._map.on('mouseup', mouseUp);
				dragStart({latlng: this._waypoints[i].latLng});
			} else {
				m.on('dragstart', dragStart);
				m.on('drag', drag);
				m.on('dragend', dragEnd);
			}
		},

		dragNewWaypoint: function(e) {
			var newWpIndex = e.afterIndex + 1;
			if (this.options.routeWhileDragging) {
				this.spliceWaypoints(newWpIndex, 0, e.latlng);
				this._hookWaypointEvents(this._markers[newWpIndex], newWpIndex, true);
			} else {
				this._dragNewWaypoint(newWpIndex, e.latlng);
			}
		},

		_dragNewWaypoint: function(newWpIndex, initialLatLng) {
			var wp = new Waypoint(initialLatLng),
				prevWp = this._waypoints[newWpIndex - 1],
				nextWp = this._waypoints[newWpIndex],
				marker = this.options.createMarker(newWpIndex, wp, this._waypoints.length + 1),
				lines = [],
				draggingEnabled = this._map.dragging.enabled(),
				mouseMove = L.bind(function(e) {
					var i,
						latLngs;
					if (marker) {
						marker.setLatLng(e.latlng);
					}
					for (i = 0; i < lines.length; i++) {
						latLngs = lines[i].getLatLngs();
						latLngs.splice(1, 1, e.latlng);
						lines[i].setLatLngs(latLngs);
					}

					L.DomEvent.stop(e);
				}, this),
				mouseUp = L.bind(function(e) {
					var i;
					if (marker) {
						this._map.removeLayer(marker);
					}
					for (i = 0; i < lines.length; i++) {
						this._map.removeLayer(lines[i]);
					}
					this._map.off('mousemove', mouseMove);
					this._map.off('mouseup', mouseUp);
					this.spliceWaypoints(newWpIndex, 0, e.latlng);
					if (draggingEnabled) {
						this._map.dragging.enable();
					}

					L.DomEvent.stop(e);
				}, this),
				i;

			if (marker) {
				marker.addTo(this._map);
			}

			for (i = 0; i < this.options.dragStyles.length; i++) {
				lines.push(L.polyline([prevWp.latLng, initialLatLng, nextWp.latLng],
					this.options.dragStyles[i]).addTo(this._map));
			}

			if (draggingEnabled) {
				this._map.dragging.disable();
			}

			this._map.on('mousemove', mouseMove);
			this._map.on('mouseup', mouseUp);
		},

		_focusGeocoder: function(i) {
			if (this._geocoderElems[i]) {
				this._geocoderElems[i].focus();
			} else {
				document.activeElement.blur();
			}
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./geocoder-element":7,"./waypoint":17}],17:[function(_dereq_,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);

	module.exports = L.Class.extend({
		options: {
			allowUTurn: false,
		},
		initialize: function(latLng, name, options) {
			L.Util.setOptions(this, options);
			this.latLng = L.latLng(latLng);
			this.name = name;
		}
	});
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],18:[function(_dereq_,module,exports){
var languages = _dereq_('./languages');
var instructions = languages.instructions;
var grammars = languages.grammars;
var abbreviations = languages.abbreviations;

module.exports = function(version) {
    Object.keys(instructions).forEach(function(code) {
        if (!instructions[code][version]) { throw 'invalid version ' + version + ': ' + code + ' not supported'; }
    });

    return {
        capitalizeFirstLetter: function(language, string) {
            return string.charAt(0).toLocaleUpperCase(language) + string.slice(1);
        },
        ordinalize: function(language, number) {
            // Transform numbers to their translated ordinalized value
            if (!language) throw new Error('No language code provided');

            return instructions[language][version].constants.ordinalize[number.toString()] || '';
        },
        directionFromDegree: function(language, degree) {
            // Transform degrees to their translated compass direction
            if (!language) throw new Error('No language code provided');
            if (!degree && degree !== 0) {
                // step had no bearing_after degree, ignoring
                return '';
            } else if (degree >= 0 && degree <= 20) {
                return instructions[language][version].constants.direction.north;
            } else if (degree > 20 && degree < 70) {
                return instructions[language][version].constants.direction.northeast;
            } else if (degree >= 70 && degree <= 110) {
                return instructions[language][version].constants.direction.east;
            } else if (degree > 110 && degree < 160) {
                return instructions[language][version].constants.direction.southeast;
            } else if (degree >= 160 && degree <= 200) {
                return instructions[language][version].constants.direction.south;
            } else if (degree > 200 && degree < 250) {
                return instructions[language][version].constants.direction.southwest;
            } else if (degree >= 250 && degree <= 290) {
                return instructions[language][version].constants.direction.west;
            } else if (degree > 290 && degree < 340) {
                return instructions[language][version].constants.direction.northwest;
            } else if (degree >= 340 && degree <= 360) {
                return instructions[language][version].constants.direction.north;
            } else {
                throw new Error('Degree ' + degree + ' invalid');
            }
        },
        laneConfig: function(step) {
            // Reduce any lane combination down to a contracted lane diagram
            if (!step.intersections || !step.intersections[0].lanes) throw new Error('No lanes object');

            var config = [];
            var currentLaneValidity = null;

            step.intersections[0].lanes.forEach(function (lane) {
                if (currentLaneValidity === null || currentLaneValidity !== lane.valid) {
                    if (lane.valid) {
                        config.push('o');
                    } else {
                        config.push('x');
                    }
                    currentLaneValidity = lane.valid;
                }
            });

            return config.join('');
        },
        getWayName: function(language, step, options) {
            var classes = options ? options.classes || [] : [];
            if (typeof step !== 'object') throw new Error('step must be an Object');
            if (!language) throw new Error('No language code provided');
            if (!Array.isArray(classes)) throw new Error('classes must be an Array or undefined');

            var wayName;
            var name = step.name || '';
            var ref = (step.ref || '').split(';')[0];

            // Remove hacks from Mapbox Directions mixing ref into name
            if (name === step.ref) {
                // if both are the same we assume that there used to be an empty name, with the ref being filled in for it
                // we only need to retain the ref then
                name = '';
            }
            name = name.replace(' (' + step.ref + ')', '');

            // In attempt to avoid using the highway name of a way,
            // check and see if the step has a class which should signal
            // the ref should be used instead of the name.
            var wayMotorway = classes.indexOf('motorway') !== -1;

            if (name && ref && name !== ref && !wayMotorway) {
                var phrase = instructions[language][version].phrase['name and ref'] ||
                    instructions.en[version].phrase['name and ref'];
                wayName = this.tokenize(language, phrase, {
                    name: name,
                    ref: ref
                }, options);
            } else if (name && ref && wayMotorway && (/\d/).test(ref)) {
                wayName = options && options.formatToken ? options.formatToken('ref', ref) : ref;
            } else if (!name && ref) {
                wayName = options && options.formatToken ? options.formatToken('ref', ref) : ref;
            } else {
                wayName = options && options.formatToken ? options.formatToken('name', name) : name;
            }

            return wayName;
        },

        /**
         * Formulate a localized text instruction from a step.
         *
         * @param  {string} language           Language code.
         * @param  {object} step               Step including maneuver property.
         * @param  {object} opts               Additional options.
         * @param  {string} opts.legIndex      Index of leg in the route.
         * @param  {string} opts.legCount      Total number of legs in the route.
         * @param  {array}  opts.classes       List of road classes.
         * @param  {string} opts.waypointName  Name of waypoint for arrival instruction.
         *
         * @return {string} Localized text instruction.
         */
        compile: function(language, step, opts) {
            if (!language) throw new Error('No language code provided');
            if (languages.supportedCodes.indexOf(language) === -1) throw new Error('language code ' + language + ' not loaded');
            if (!step.maneuver) throw new Error('No step maneuver provided');
            var options = opts || {};

            var type = step.maneuver.type;
            var modifier = step.maneuver.modifier;
            var mode = step.mode;
            // driving_side will only be defined in OSRM 5.14+
            var side = step.driving_side;

            if (!type) { throw new Error('Missing step maneuver type'); }
            if (type !== 'depart' && type !== 'arrive' && !modifier) { throw new Error('Missing step maneuver modifier'); }

            if (!instructions[language][version][type]) {
                // Log for debugging
                console.log('Encountered unknown instruction type: ' + type); // eslint-disable-line no-console
                // OSRM specification assumes turn types can be added without
                // major version changes. Unknown types are to be treated as
                // type `turn` by clients
                type = 'turn';
            }

            // Use special instructions if available, otherwise `defaultinstruction`
            var instructionObject;
            if (instructions[language][version].modes[mode]) {
                instructionObject = instructions[language][version].modes[mode];
            } else {
              // omit side from off ramp if same as driving_side
              // note: side will be undefined if the input is from OSRM <5.14
              // but the condition should still evaluate properly regardless
                var omitSide = type === 'off ramp' && modifier.indexOf(side) >= 0;
                if (instructions[language][version][type][modifier] && !omitSide) {
                    instructionObject = instructions[language][version][type][modifier];
                } else {
                    instructionObject = instructions[language][version][type].default;
                }
            }

            // Special case handling
            var laneInstruction;
            switch (type) {
            case 'use lane':
                laneInstruction = instructions[language][version].constants.lanes[this.laneConfig(step)];
                if (!laneInstruction) {
                    // If the lane combination is not found, default to continue straight
                    instructionObject = instructions[language][version]['use lane'].no_lanes;
                }
                break;
            case 'rotary':
            case 'roundabout':
                if (step.rotary_name && step.maneuver.exit && instructionObject.name_exit) {
                    instructionObject = instructionObject.name_exit;
                } else if (step.rotary_name && instructionObject.name) {
                    instructionObject = instructionObject.name;
                } else if (step.maneuver.exit && instructionObject.exit) {
                    instructionObject = instructionObject.exit;
                } else {
                    instructionObject = instructionObject.default;
                }
                break;
            default:
                // NOOP, since no special logic for that type
            }

            // Decide way_name with special handling for name and ref
            var wayName = this.getWayName(language, step, options);

            // Decide which instruction string to use
            // In order of precedence:
            //   - exit + destination signage
            //   - destination signage
            //   - exit signage
            //   - junction name
            //   - road name
            //   - waypoint name (for arrive maneuver)
            //   - default
            var instruction;
            if (step.destinations && step.exits && instructionObject.exit_destination) {
                instruction = instructionObject.exit_destination;
            } else if (step.destinations && instructionObject.destination) {
                instruction = instructionObject.destination;
            } else if (step.exits && instructionObject.exit) {
                instruction = instructionObject.exit;
            } else if (step.junction_name && instructionObject.junction_name) {
                instruction = instructionObject.junction_name;
            } else if (wayName && instructionObject.name) {
                instruction = instructionObject.name;
            } else if (options.waypointName && instructionObject.named) {
                instruction = instructionObject.named;
            } else {
                instruction = instructionObject.default;
            }

            var destinations = step.destinations && step.destinations.split(': ');
            var destinationRef = destinations && destinations[0].split(',')[0];
            var destination = destinations && destinations[1] && destinations[1].split(',')[0];
            var firstDestination;
            if (destination && destinationRef) {
                firstDestination = destinationRef + ': ' + destination;
            } else {
                firstDestination = destinationRef || destination || '';
            }

            var nthWaypoint = options.legIndex >= 0 && options.legIndex !== options.legCount - 1 ? this.ordinalize(language, options.legIndex + 1) : '';

            // Replace tokens
            // NOOP if they don't exist
            var replaceTokens = {
                'way_name': wayName,
                'destination': firstDestination,
                'exit': (step.exits || '').split(';')[0],
                'exit_number': this.ordinalize(language, step.maneuver.exit || 1),
                'rotary_name': step.rotary_name,
                'lane_instruction': laneInstruction,
                'modifier': instructions[language][version].constants.modifier[modifier],
                'direction': this.directionFromDegree(language, step.maneuver.bearing_after),
                'nth': nthWaypoint,
                'waypoint_name': options.waypointName,
                'junction_name': (step.junction_name || '').split(';')[0]
            };

            return this.tokenize(language, instruction, replaceTokens, options);
        },
        grammarize: function(language, name, grammar) {
            if (!language) throw new Error('No language code provided');
            // Process way/rotary/any name with applying grammar rules if any
            if (grammar && grammars && grammars[language] && grammars[language][version]) {
                var rules = grammars[language][version][grammar];
                if (rules) {
                    // Pass original name to rules' regular expressions enclosed with spaces for simplier parsing
                    var n = ' ' + name + ' ';
                    var flags = grammars[language].meta.regExpFlags || '';
                    rules.forEach(function(rule) {
                        var re = new RegExp(rule[0], flags);
                        n = n.replace(re, rule[1]);
                    });

                    return n.trim();
                }
            }

            return name;
        },
        abbreviations: abbreviations,
        tokenize: function(language, instruction, tokens, options) {
            if (!language) throw new Error('No language code provided');
            // Keep this function context to use in inline function below (no arrow functions in ES4)
            var that = this;
            var startedWithToken = false;
            var output = instruction.replace(/\{(\w+)(?::(\w+))?\}/g, function(token, tag, grammar, offset) {
                var value = tokens[tag];

                // Return unknown token unchanged
                if (typeof value === 'undefined') {
                    return token;
                }

                value = that.grammarize(language, value, grammar);

                // If this token appears at the beginning of the instruction, capitalize it.
                if (offset === 0 && instructions[language].meta.capitalizeFirstLetter) {
                    startedWithToken = true;
                    value = that.capitalizeFirstLetter(language, value);
                }

                if (options && options.formatToken) {
                    value = options.formatToken(tag, value);
                }

                return value;
            })
            .replace(/ {2}/g, ' '); // remove excess spaces

            if (!startedWithToken && instructions[language].meta.capitalizeFirstLetter) {
                return this.capitalizeFirstLetter(language, output);
            }

            return output;
        }
    };
};

},{"./languages":19}],19:[function(_dereq_,module,exports){
// Load all language files explicitly to allow integration
// with bundling tools like webpack and browserify
/*var instructionsAr = require('./languages/translations/ar.json');
var instructionsDa = require('./languages/translations/da.json');*/
var instructionsDe = _dereq_('./languages/translations/de.json');
var instructionsEn = _dereq_('./languages/translations/en.json');
/*var instructionsEo = require('./languages/translations/eo.json');
var instructionsEs = require('./languages/translations/es.json');
var instructionsEsEs = require('./languages/translations/es-ES.json');
var instructionsFi = require('./languages/translations/fi.json');
var instructionsFr = require('./languages/translations/fr.json');
var instructionsHe = require('./languages/translations/he.json');
var instructionsHu = require('./languages/translations/hu.json');
var instructionsId = require('./languages/translations/id.json');
var instructionsIt = require('./languages/translations/it.json');
var instructionsJa = require('./languages/translations/ja.json');
var instructionsKo = require('./languages/translations/ko.json');
var instructionsMy = require('./languages/translations/my.json');
var instructionsNl = require('./languages/translations/nl.json');
var instructionsNo = require('./languages/translations/no.json');
var instructionsPl = require('./languages/translations/pl.json');
var instructionsPtBr = require('./languages/translations/pt-BR.json');
var instructionsPtPt = require('./languages/translations/pt-PT.json');
var instructionsRo = require('./languages/translations/ro.json');
var instructionsRu = require('./languages/translations/ru.json');
var instructionsSl = require('./languages/translations/sl.json');
var instructionsSv = require('./languages/translations/sv.json');
var instructionsTr = require('./languages/translations/tr.json');
var instructionsUk = require('./languages/translations/uk.json');
var instructionsVi = require('./languages/translations/vi.json');
var instructionsYo = require('./languages/translations/yo.json');
var instructionsZhHans = require('./languages/translations/zh-Hans.json');*/

// Load all grammar files
/*
var grammarDa = require('./languages/grammar/da.json');
var grammarFr = require('./languages/grammar/fr.json');
var grammarHu = require('./languages/grammar/hu.json');
var grammarRu = require('./languages/grammar/ru.json');
*/

// Load all abbreviations files
/*
var abbreviationsBg = require('./languages/abbreviations/bg.json');
var abbreviationsCa = require('./languages/abbreviations/ca.json');
var abbreviationsDa = require('./languages/abbreviations/da.json');
*/
var abbreviationsDe = _dereq_('./languages/abbreviations/de.json');
var abbreviationsEn = _dereq_('./languages/abbreviations/en.json');
/*
var abbreviationsEs = require('./languages/abbreviations/es.json');
var abbreviationsFr = require('./languages/abbreviations/fr.json');
var abbreviationsHe = require('./languages/abbreviations/he.json');
var abbreviationsHu = require('./languages/abbreviations/hu.json');
var abbreviationsLt = require('./languages/abbreviations/lt.json');
var abbreviationsNl = require('./languages/abbreviations/nl.json');
var abbreviationsRu = require('./languages/abbreviations/ru.json');
var abbreviationsSl = require('./languages/abbreviations/sl.json');
var abbreviationsSv = require('./languages/abbreviations/sv.json');
var abbreviationsUk = require('./languages/abbreviations/uk.json');
var abbreviationsVi = require('./languages/abbreviations/vi.json');
*/

// Create a list of supported codes
var instructions = {
/*
    'ar': instructionsAr,
    'da': instructionsDa,
*/
    'de': instructionsDe,
    'en': instructionsEn
/*,
    'eo': instructionsEo,
    'es': instructionsEs,
    'es-ES': instructionsEsEs,
    'fi': instructionsFi,
    'fr': instructionsFr,
    'he': instructionsHe,
    'hu': instructionsHu,
    'id': instructionsId,
    'it': instructionsIt,
    'ja': instructionsJa,
    'ko': instructionsKo,
    'my': instructionsMy,
    'nl': instructionsNl,
    'no': instructionsNo,
    'pl': instructionsPl,
    'pt-BR': instructionsPtBr,
    'pt-PT': instructionsPtPt,
    'ro': instructionsRo,
    'ru': instructionsRu,
    'sl': instructionsSl,
    'sv': instructionsSv,
    'tr': instructionsTr,
    'uk': instructionsUk,
    'vi': instructionsVi,
    'yo': instructionsYo,
    'zh-Hans': instructionsZhHans
*/
};

// Create list of supported grammar
var grammars = {
/*
    'da': grammarDa,
    'fr': grammarFr,
    'hu': grammarHu,
    'ru': grammarRu
*/
};

// Create list of supported abbrevations
var abbreviations = {
/*
    'bg': abbreviationsBg,
    'ca': abbreviationsCa,
    'da': abbreviationsDa,
*/
    'de': abbreviationsDe,
    'en': abbreviationsEn
/*,
    'es': abbreviationsEs,
    'fr': abbreviationsFr,
    'he': abbreviationsHe,
    'hu': abbreviationsHu,
    'lt': abbreviationsLt,
    'nl': abbreviationsNl,
    'ru': abbreviationsRu,
    'sl': abbreviationsSl,
    'sv': abbreviationsSv,
    'uk': abbreviationsUk,
    'vi': abbreviationsVi
*/
};
module.exports = {
    supportedCodes: Object.keys(instructions),
    instructions: instructions,
    grammars: grammars,
    abbreviations: abbreviations
};

},{"./languages/abbreviations/de.json":20,"./languages/abbreviations/en.json":21,"./languages/translations/de.json":22,"./languages/translations/en.json":23}],20:[function(_dereq_,module,exports){
module.exports={
    "abbreviations": {},
    "classifications": {},
    "directions": {
        "osten": "O",
        "nordosten": "NO",
        "süden": "S",
        "nordwest": "NW",
        "norden": "N",
        "südost": "SO",
        "südwest": "SW",
        "westen": "W"
    }
}

},{}],21:[function(_dereq_,module,exports){
module.exports={
    "abbreviations": {
        "square": "Sq",
        "centre": "Ctr",
        "sister": "Sr",
        "lake": "Lk",
        "fort": "Ft",
        "route": "Rte",
        "william": "Wm",
        "national": "Nat’l",
        "junction": "Jct",
        "center": "Ctr",
        "saint": "St",
        "saints": "SS",
        "station": "Sta",
        "mount": "Mt",
        "junior": "Jr",
        "mountain": "Mtn",
        "heights": "Hts",
        "university": "Univ",
        "school": "Sch",
        "international": "Int’l",
        "apartments": "Apts",
        "crossing": "Xing",
        "creek": "Crk",
        "township": "Twp",
        "downtown": "Dtwn",
        "father": "Fr",
        "senior": "Sr",
        "point": "Pt",
        "river": "Riv",
        "market": "Mkt",
        "village": "Vil",
        "park": "Pk",
        "memorial": "Mem"
    },
    "classifications": {
        "place": "Pl",
        "circle": "Cir",
        "bypass": "Byp",
        "motorway": "Mwy",
        "crescent": "Cres",
        "road": "Rd",
        "cove": "Cv",
        "lane": "Ln",
        "square": "Sq",
        "street": "St",
        "freeway": "Fwy",
        "walk": "Wk",
        "plaza": "Plz",
        "parkway": "Pky",
        "avenue": "Ave",
        "pike": "Pk",
        "drive": "Dr",
        "highway": "Hwy",
        "footway": "Ftwy",
        "point": "Pt",
        "court": "Ct",
        "terrace": "Ter",
        "walkway": "Wky",
        "alley": "Aly",
        "expressway": "Expy",
        "bridge": "Br",
        "boulevard": "Blvd",
        "turnpike": "Tpk"
    },
    "directions": {
        "southeast": "SE",
        "northwest": "NW",
        "south": "S",
        "west": "W",
        "southwest": "SW",
        "north": "N",
        "east": "E",
        "northeast": "NE"
    }
}

},{}],22:[function(_dereq_,module,exports){
module.exports={
    "meta": {
        "capitalizeFirstLetter": true
    },
    "v5": {
        "constants": {
            "ordinalize": {
                "1": "erste",
                "2": "zweite",
                "3": "dritte",
                "4": "vierte",
                "5": "fünfte",
                "6": "sechste",
                "7": "siebente",
                "8": "achte",
                "9": "neunte",
                "10": "zehnte"
            },
            "direction": {
                "north": "Norden",
                "northeast": "Nordosten",
                "east": "Osten",
                "southeast": "Südosten",
                "south": "Süden",
                "southwest": "Südwesten",
                "west": "Westen",
                "northwest": "Nordwesten"
            },
            "modifier": {
                "left": "links",
                "right": "rechts",
                "sharp left": "scharf links",
                "sharp right": "scharf rechts",
                "slight left": "leicht links",
                "slight right": "leicht rechts",
                "straight": "geradeaus",
                "uturn": "180°-Wendung"
            },
            "lanes": {
                "xo": "Rechts halten",
                "ox": "Links halten",
                "xox": "Mittlere Spur nutzen",
                "oxo": "Rechts oder links halten"
            }
        },
        "modes": {
            "ferry": {
                "default": "Fähre nehmen",
                "name": "Fähre nehmen {way_name}",
                "destination": "Fähre nehmen Richtung {destination}"
            }
        },
        "phrase": {
            "two linked by distance": "{instruction_one} danach in {distance} {instruction_two}",
            "two linked": "{instruction_one} danach {instruction_two}",
            "one in distance": "In {distance}, {instruction_one}",
            "name and ref": "{name} ({ref})",
            "exit with number": "exit {exit}"
        },
        "arrive": {
            "default": {
                "default": "Sie haben Ihr {nth} Ziel erreicht",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}"
            },
            "left": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich links"
            },
            "right": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich rechts"
            },
            "sharp left": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich links"
            },
            "sharp right": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich rechts"
            },
            "slight right": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich rechts",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich rechts"
            },
            "slight left": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich links",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich links"
            },
            "straight": {
                "default": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich geradeaus",
                "upcoming": "Sie haben Ihr {nth} Ziel erreicht, es befindet sich geradeaus",
                "short": "Sie haben Ihr {nth} Ziel erreicht",
                "short-upcoming": "Sie haben Ihr {nth} Ziel erreicht",
                "named": "Sie haben Ihr {waypoint_name}, es befindet sich geradeaus"
            }
        },
        "continue": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} weiterfahren auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}",
                "exit": "{modifier} abbiegen auf {way_name}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Weiterfahren in Richtung {destination}",
                "distance": "Geradeaus weiterfahren für {distance}",
                "namedistance": "Geradeaus weiterfahren auf {way_name} für {distance}"
            },
            "sharp left": {
                "default": "Scharf links",
                "name": "Scharf links weiterfahren auf {way_name}",
                "destination": "Scharf links Richtung {destination}",
                "junction_name": "Scharf links weiterfahren an {junction_name}"
            },
            "sharp right": {
                "default": "Scharf rechts",
                "name": "Scharf rechts weiterfahren auf {way_name}",
                "destination": "Scharf rechts Richtung {destination}",
                "junction_name": "Scharf rechts weiterfahren an {junction_name}"
            },
            "slight left": {
                "default": "Leicht links",
                "name": "Leicht links weiter auf {way_name}",
                "destination": "Leicht links weiter Richtung {destination}",
                "junction_name": "Leicht links weiter an {junction_name}"
            },
            "slight right": {
                "default": "Leicht rechts weiter",
                "name": "Leicht rechts weiter auf {way_name}",
                "destination": "Leicht rechts weiter Richtung {destination}",
                "junction_name": "Leicht rechts weiter an {junction_name}"
            },
            "uturn": {
                "default": "180°-Wendung",
                "name": "180°-Wendung auf {way_name}",
                "destination": "180°-Wendung Richtung {destination}",
                "junction_name": "180°-Wendung an {junction_name}"
            }
        },
        "depart": {
            "default": {
                "default": "Fahren Sie Richtung {direction}",
                "name": "Fahren Sie Richtung {direction} auf {way_name}",
                "namedistance": "Fahren Sie Richtung {direction} auf {way_name} für {distance}"
            }
        },
        "end of road": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} abbiegen auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}",
                "junction_name": "{modifier} abbiegen an {junction_name}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Geradeaus weiterfahren Richtung {destination}",
                "junction_name": "Geradeaus weiterfahren an {junction_name}"
            },
            "uturn": {
                "default": "180°-Wendung am Ende der Straße",
                "name": "180°-Wendung auf {way_name} am Ende der Straße",
                "destination": "180°-Wendung Richtung {destination} am Ende der Straße",
                "junction_name": "180°-Wendung an {junction_name}"
            }
        },
        "fork": {
            "default": {
                "default": "{modifier} halten an der Gabelung",
                "name": "{modifier} halten an der Gabelung auf {way_name}",
                "destination": "{modifier} halten an der Gabelung Richtung {destination}"
            },
            "slight left": {
                "default": "Links halten an der Gabelung",
                "name": "Links halten an der Gabelung auf {way_name}",
                "destination": "Links halten an der Gabelung Richtung {destination}"
            },
            "slight right": {
                "default": "Rechts halten an der Gabelung",
                "name": "Rechts halten an der Gabelung auf {way_name}",
                "destination": "Rechts halten an der Gabelung Richtung {destination}"
            },
            "sharp left": {
                "default": "Scharf links abbiegen an der Gabelung",
                "name": "Scharf links auf {way_name}",
                "destination": "Scharf links Richtung {destination}"
            },
            "sharp right": {
                "default": "Scharf rechts abbiegen an der Gabelung",
                "name": "Scharf rechts auf {way_name}",
                "destination": "Scharf rechts Richtung {destination}"
            },
            "uturn": {
                "default": "180°-Wendung",
                "name": "180°-Wendung auf {way_name}",
                "destination": "180°-Wendung Richtung {destination}"
            }
        },
        "merge": {
            "default": {
                "default": "{modifier} auffahren",
                "name": "{modifier} auffahren auf {way_name}",
                "destination": "{modifier} auffahren Richtung {destination}"
            },
            "straight": {
                "default": "geradeaus auffahren",
                "name": "geradeaus auffahren auf {way_name}",
                "destination": "geradeaus auffahren Richtung {destination}"
            },
            "slight left": {
                "default": "Leicht links auffahren",
                "name": "Leicht links auffahren auf {way_name}",
                "destination": "Leicht links auffahren Richtung {destination}"
            },
            "slight right": {
                "default": "Leicht rechts auffahren",
                "name": "Leicht rechts auffahren auf {way_name}",
                "destination": "Leicht rechts auffahren Richtung {destination}"
            },
            "sharp left": {
                "default": "Scharf links auffahren",
                "name": "Scharf links auffahren auf {way_name}",
                "destination": "Scharf links auffahren Richtung {destination}"
            },
            "sharp right": {
                "default": "Scharf rechts auffahren",
                "name": "Scharf rechts auffahren auf {way_name}",
                "destination": "Scharf rechts auffahren Richtung {destination}"
            },
            "uturn": {
                "default": "180°-Wendung",
                "name": "180°-Wendung auf {way_name}",
                "destination": "180°-Wendung Richtung {destination}"
            }
        },
        "new name": {
            "default": {
                "default": "{modifier} weiterfahren",
                "name": "{modifier} weiterfahren auf {way_name}",
                "destination": "{modifier} weiterfahren Richtung {destination}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Weiterfahren auf {way_name}",
                "destination": "Weiterfahren in Richtung {destination}"
            },
            "sharp left": {
                "default": "Scharf links",
                "name": "Scharf links auf {way_name}",
                "destination": "Scharf links Richtung {destination}"
            },
            "sharp right": {
                "default": "Scharf rechts",
                "name": "Scharf rechts auf {way_name}",
                "destination": "Scharf rechts Richtung {destination}"
            },
            "slight left": {
                "default": "Leicht links weiter",
                "name": "Leicht links weiter auf {way_name}",
                "destination": "Leicht links weiter Richtung {destination}"
            },
            "slight right": {
                "default": "Leicht rechts weiter",
                "name": "Leicht rechts weiter auf {way_name}",
                "destination": "Leicht rechts weiter Richtung {destination}"
            },
            "uturn": {
                "default": "180°-Wendung",
                "name": "180°-Wendung auf {way_name}",
                "destination": "180°-Wendung Richtung {destination}"
            }
        },
        "notification": {
            "default": {
                "default": "{modifier} weiterfahren",
                "name": "{modifier} weiterfahren auf {way_name}",
                "destination": "{modifier} weiterfahren Richtung {destination}"
            },
            "uturn": {
                "default": "180°-Wendung",
                "name": "180°-Wendung auf {way_name}",
                "destination": "180°-Wendung Richtung {destination}"
            }
        },
        "off ramp": {
            "default": {
                "default": "Ausfahrt nehmen",
                "name": "Ausfahrt nehmen auf {way_name}",
                "destination": "Ausfahrt nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} nehmen",
                "exit_destination": "Ausfahrt {exit} nehmen Richtung {destination}"
            },
            "left": {
                "default": "Ausfahrt links nehmen",
                "name": "Ausfahrt links nehmen auf {way_name}",
                "destination": "Ausfahrt links nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} links nehmen",
                "exit_destination": "Ausfahrt {exit} links nehmen Richtung {destination}"
            },
            "right": {
                "default": "Ausfahrt rechts nehmen",
                "name": "Ausfahrt rechts nehmen Richtung {way_name}",
                "destination": "Ausfahrt rechts nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} rechts nehmen",
                "exit_destination": "Ausfahrt {exit} nehmen Richtung {destination}"
            },
            "sharp left": {
                "default": "Ausfahrt links nehmen",
                "name": "Ausfahrt links Seite nehmen auf {way_name}",
                "destination": "Ausfahrt links nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} links nehmen",
                "exit_destination": "Ausfahrt{exit} links nehmen Richtung {destination}"
            },
            "sharp right": {
                "default": "Ausfahrt rechts nehmen",
                "name": "Ausfahrt rechts nehmen auf {way_name}",
                "destination": "Ausfahrt rechts nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} rechts nehmen",
                "exit_destination": "Ausfahrt {exit} nehmen Richtung {destination}"
            },
            "slight left": {
                "default": "Ausfahrt links nehmen",
                "name": "Ausfahrt links nehmen auf {way_name}",
                "destination": "Ausfahrt links nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} nehmen",
                "exit_destination": "Ausfahrt {exit} links nehmen Richtung {destination}"
            },
            "slight right": {
                "default": "Ausfahrt rechts nehmen",
                "name": "Ausfahrt rechts nehmen auf {way_name}",
                "destination": "Ausfahrt rechts nehmen Richtung {destination}",
                "exit": "Ausfahrt {exit} rechts nehmen",
                "exit_destination": "Ausfahrt {exit} nehmen Richtung {destination}"
            }
        },
        "on ramp": {
            "default": {
                "default": "Auffahrt nehmen",
                "name": "Auffahrt nehmen auf {way_name}",
                "destination": "Auffahrt nehmen Richtung {destination}"
            },
            "left": {
                "default": "Auffahrt links nehmen",
                "name": "Auffahrt links nehmen auf {way_name}",
                "destination": "Auffahrt links nehmen Richtung {destination}"
            },
            "right": {
                "default": "Auffahrt rechts nehmen",
                "name": "Auffahrt rechts nehmen auf {way_name}",
                "destination": "Auffahrt rechts nehmen Richtung {destination}"
            },
            "sharp left": {
                "default": "Auffahrt links nehmen",
                "name": "Auffahrt links nehmen auf {way_name}",
                "destination": "Auffahrt links nehmen Richtung {destination}"
            },
            "sharp right": {
                "default": "Auffahrt rechts nehmen",
                "name": "Auffahrt rechts nehmen auf {way_name}",
                "destination": "Auffahrt rechts nehmen Richtung {destination}"
            },
            "slight left": {
                "default": "Auffahrt links Seite nehmen",
                "name": "Auffahrt links nehmen auf {way_name}",
                "destination": "Auffahrt links nehmen Richtung {destination}"
            },
            "slight right": {
                "default": "Auffahrt rechts nehmen",
                "name": "Auffahrt rechts nehmen auf {way_name}",
                "destination": "Auffahrt rechts nehmen Richtung {destination}"
            }
        },
        "rotary": {
            "default": {
                "default": {
                    "default": "In den Kreisverkehr fahren",
                    "name": "Im Kreisverkehr die Ausfahrt auf {way_name} nehmen",
                    "destination": "Im Kreisverkehr die Ausfahrt Richtung {destination} nehmen"
                },
                "name": {
                    "default": "In {rotary_name} fahren",
                    "name": "In {rotary_name} die Ausfahrt auf {way_name} nehmen",
                    "destination": "In {rotary_name} die Ausfahrt Richtung {destination} nehmen"
                },
                "exit": {
                    "default": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen",
                    "name": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen auf {way_name}",
                    "destination": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen Richtung {destination}"
                },
                "name_exit": {
                    "default": "In den Kreisverkehr fahren und {exit_number} Ausfahrt nehmen",
                    "name": "In den Kreisverkehr fahren und {exit_number} Ausfahrt nehmen auf {way_name}",
                    "destination": "In den Kreisverkehr fahren und {exit_number} Ausfahrt nehmen Richtung {destination}"
                }
            }
        },
        "roundabout": {
            "default": {
                "exit": {
                    "default": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen",
                    "name": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen auf {way_name}",
                    "destination": "Im Kreisverkehr die {exit_number} Ausfahrt nehmen Richtung {destination}"
                },
                "default": {
                    "default": "In den Kreisverkehr fahren",
                    "name": "Im Kreisverkehr die Ausfahrt auf {way_name} nehmen",
                    "destination": "Im Kreisverkehr die Ausfahrt Richtung {destination} nehmen"
                }
            }
        },
        "roundabout turn": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} abbiegen auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}"
            },
            "left": {
                "default": "Links abbiegen",
                "name": "Links abbiegen auf {way_name}",
                "destination": "Links abbiegen Richtung {destination}"
            },
            "right": {
                "default": "Rechts abbiegen",
                "name": "Rechts abbiegen auf {way_name}",
                "destination": "Rechts abbiegen Richtung {destination}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Geradeaus weiterfahren Richtung {destination}"
            }
        },
        "exit roundabout": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} abbiegen auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}"
            },
            "left": {
                "default": "Links abbiegen",
                "name": "Links abbiegen auf {way_name}",
                "destination": "Links abbiegen Richtung {destination}"
            },
            "right": {
                "default": "Rechts abbiegen",
                "name": "Rechts abbiegen auf {way_name}",
                "destination": "Rechts abbiegen Richtung {destination}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Geradeaus weiterfahren Richtung {destination}"
            }
        },
        "exit rotary": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} abbiegen auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}"
            },
            "left": {
                "default": "Links abbiegen",
                "name": "Links abbiegen auf {way_name}",
                "destination": "Links abbiegen Richtung {destination}"
            },
            "right": {
                "default": "Rechts abbiegen",
                "name": "Rechts abbiegen auf {way_name}",
                "destination": "Rechts abbiegen Richtung {destination}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Geradeaus weiterfahren Richtung {destination}"
            }
        },
        "turn": {
            "default": {
                "default": "{modifier} abbiegen",
                "name": "{modifier} abbiegen auf {way_name}",
                "destination": "{modifier} abbiegen Richtung {destination}",
                "junction_name": "Make a {modifier} at {junction_name}"
            },
            "left": {
                "default": "Links abbiegen",
                "name": "Links abbiegen auf {way_name}",
                "destination": "Links abbiegen Richtung {destination}",
                "junction_name": "Links abbiegen an {junction_name}"
            },
            "right": {
                "default": "Rechts abbiegen",
                "name": "Rechts abbiegen auf {way_name}",
                "destination": "Rechts abbiegen Richtung {destination}",
                "junction_name": "Rechts abbiegen an {junction_name}"
            },
            "straight": {
                "default": "Geradeaus weiterfahren",
                "name": "Geradeaus weiterfahren auf {way_name}",
                "destination": "Geradeaus weiterfahren Richtung {destination}",
                "junction_name": "Geradeaus weiterfahren an {junction_name}"
            }
        },
        "use lane": {
            "no_lanes": {
                "default": "Geradeaus weiterfahren"
            },
            "default": {
                "default": "{lane_instruction}"
            }
        }
    }
}

},{}],23:[function(_dereq_,module,exports){
module.exports={
    "meta": {
        "capitalizeFirstLetter": true
    },
    "v5": {
        "constants": {
            "ordinalize": {
                "1": "1st",
                "2": "2nd",
                "3": "3rd",
                "4": "4th",
                "5": "5th",
                "6": "6th",
                "7": "7th",
                "8": "8th",
                "9": "9th",
                "10": "10th"
            },
            "direction": {
                "north": "north",
                "northeast": "northeast",
                "east": "east",
                "southeast": "southeast",
                "south": "south",
                "southwest": "southwest",
                "west": "west",
                "northwest": "northwest"
            },
            "modifier": {
                "left": "left",
                "right": "right",
                "sharp left": "sharp left",
                "sharp right": "sharp right",
                "slight left": "slight left",
                "slight right": "slight right",
                "straight": "straight",
                "uturn": "U-turn"
            },
            "lanes": {
                "xo": "Keep right",
                "ox": "Keep left",
                "xox": "Keep in the middle",
                "oxo": "Keep left or right"
            }
        },
        "modes": {
            "ferry": {
                "default": "Take the ferry",
                "name": "Take the ferry {way_name}",
                "destination": "Take the ferry towards {destination}"
            }
        },
        "phrase": {
            "two linked by distance": "{instruction_one}, then, in {distance}, {instruction_two}",
            "two linked": "{instruction_one}, then {instruction_two}",
            "one in distance": "In {distance}, {instruction_one}",
            "name and ref": "{name} ({ref})",
            "exit with number": "exit {exit}"
        },
        "arrive": {
            "default": {
                "default": "You have arrived at your {nth} destination",
                "upcoming": "You will arrive at your {nth} destination",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}"
            },
            "left": {
                "default": "You have arrived at your {nth} destination, on the left",
                "upcoming": "You will arrive at your {nth} destination, on the left",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the left"
            },
            "right": {
                "default": "You have arrived at your {nth} destination, on the right",
                "upcoming": "You will arrive at your {nth} destination, on the right",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the right"
            },
            "sharp left": {
                "default": "You have arrived at your {nth} destination, on the left",
                "upcoming": "You will arrive at your {nth} destination, on the left",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the left"
            },
            "sharp right": {
                "default": "You have arrived at your {nth} destination, on the right",
                "upcoming": "You will arrive at your {nth} destination, on the right",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the right"
            },
            "slight right": {
                "default": "You have arrived at your {nth} destination, on the right",
                "upcoming": "You will arrive at your {nth} destination, on the right",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the right"
            },
            "slight left": {
                "default": "You have arrived at your {nth} destination, on the left",
                "upcoming": "You will arrive at your {nth} destination, on the left",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, on the left"
            },
            "straight": {
                "default": "You have arrived at your {nth} destination, straight ahead",
                "upcoming": "You will arrive at your {nth} destination, straight ahead",
                "short": "You have arrived",
                "short-upcoming": "You will arrive",
                "named": "You have arrived at {waypoint_name}, straight ahead"
            }
        },
        "continue": {
            "default": {
                "default": "Turn {modifier}",
                "name": "Turn {modifier} to stay on {way_name}",
                "destination": "Turn {modifier} towards {destination}",
                "exit": "Turn {modifier} onto {way_name}"
            },
            "straight": {
                "default": "Continue straight",
                "name": "Continue straight to stay on {way_name}",
                "destination": "Continue towards {destination}",
                "distance": "Continue straight for {distance}",
                "namedistance": "Continue on {way_name} for {distance}"
            },
            "sharp left": {
                "default": "Make a sharp left",
                "name": "Make a sharp left to stay on {way_name}",
                "destination": "Make a sharp left towards {destination}",
                "junction_name": "Make a sharp left at {junction_name}"
            },
            "sharp right": {
                "default": "Make a sharp right",
                "name": "Make a sharp right to stay on {way_name}",
                "destination": "Make a sharp right towards {destination}",
                "junction_name": "Make a sharp right at {junction_name}"
            },
            "slight left": {
                "default": "Make a slight left",
                "name": "Make a slight left to stay on {way_name}",
                "destination": "Make a slight left towards {destination}",
                "junction_name": "Make a slight left at {junction_name}"
            },
            "slight right": {
                "default": "Make a slight right",
                "name": "Make a slight right to stay on {way_name}",
                "destination": "Make a slight right towards {destination}",
                "junction_name": "Make a slight right at {junction_name}"
            },
            "uturn": {
                "default": "Make a U-turn",
                "name": "Make a U-turn and continue on {way_name}",
                "destination": "Make a U-turn towards {destination}",
                "junction_name": "Make a U-turn at {junction_name}"
            }
        },
        "depart": {
            "default": {
                "default": "Head {direction}",
                "name": "Head {direction} on {way_name}",
                "namedistance": "Head {direction} on {way_name} for {distance}"
            }
        },
        "end of road": {
            "default": {
                "default": "Turn {modifier}",
                "name": "Turn {modifier} onto {way_name}",
                "destination": "Turn {modifier} towards {destination}",
                "junction_name": "Turn {modifier} at {junction_name}"
            },
            "straight": {
                "default": "Continue straight",
                "name": "Continue straight onto {way_name}",
                "destination": "Continue straight towards {destination}",
                "junction_name": "Continue straight at {junction_name}"
            },
            "uturn": {
                "default": "Make a U-turn at the end of the road",
                "name": "Make a U-turn onto {way_name} at the end of the road",
                "destination": "Make a U-turn towards {destination} at the end of the road",
                "junction_name": "Make a U-turn at {junction_name}"
            }
        },
        "fork": {
            "default": {
                "default": "Keep {modifier} at the fork",
                "name": "Keep {modifier} onto {way_name}",
                "destination": "Keep {modifier} towards {destination}"
            },
            "slight left": {
                "default": "Keep left at the fork",
                "name": "Keep left onto {way_name}",
                "destination": "Keep left towards {destination}"
            },
            "slight right": {
                "default": "Keep right at the fork",
                "name": "Keep right onto {way_name}",
                "destination": "Keep right towards {destination}"
            },
            "sharp left": {
                "default": "Take a sharp left at the fork",
                "name": "Take a sharp left onto {way_name}",
                "destination": "Take a sharp left towards {destination}"
            },
            "sharp right": {
                "default": "Take a sharp right at the fork",
                "name": "Take a sharp right onto {way_name}",
                "destination": "Take a sharp right towards {destination}"
            },
            "uturn": {
                "default": "Make a U-turn",
                "name": "Make a U-turn onto {way_name}",
                "destination": "Make a U-turn towards {destination}"
            }
        },
        "merge": {
            "default": {
                "default": "Merge {modifier}",
                "name": "Merge {modifier} onto {way_name}",
                "destination": "Merge {modifier} towards {destination}"
            },
            "straight": {
                "default": "Merge",
                "name": "Merge onto {way_name}",
                "destination": "Merge towards {destination}"
            },
            "slight left": {
                "default": "Merge left",
                "name": "Merge left onto {way_name}",
                "destination": "Merge left towards {destination}"
            },
            "slight right": {
                "default": "Merge right",
                "name": "Merge right onto {way_name}",
                "destination": "Merge right towards {destination}"
            },
            "sharp left": {
                "default": "Merge left",
                "name": "Merge left onto {way_name}",
                "destination": "Merge left towards {destination}"
            },
            "sharp right": {
                "default": "Merge right",
                "name": "Merge right onto {way_name}",
                "destination": "Merge right towards {destination}"
            },
            "uturn": {
                "default": "Make a U-turn",
                "name": "Make a U-turn onto {way_name}",
                "destination": "Make a U-turn towards {destination}"
            }
        },
        "new name": {
            "default": {
                "default": "Continue {modifier}",
                "name": "Continue {modifier} onto {way_name}",
                "destination": "Continue {modifier} towards {destination}"
            },
            "straight": {
                "default": "Continue straight",
                "name": "Continue onto {way_name}",
                "destination": "Continue towards {destination}"
            },
            "sharp left": {
                "default": "Take a sharp left",
                "name": "Take a sharp left onto {way_name}",
                "destination": "Take a sharp left towards {destination}"
            },
            "sharp right": {
                "default": "Take a sharp right",
                "name": "Take a sharp right onto {way_name}",
                "destination": "Take a sharp right towards {destination}"
            },
            "slight left": {
                "default": "Continue slightly left",
                "name": "Continue slightly left onto {way_name}",
                "destination": "Continue slightly left towards {destination}"
            },
            "slight right": {
                "default": "Continue slightly right",
                "name": "Continue slightly right onto {way_name}",
                "destination": "Continue slightly right towards {destination}"
            },
            "uturn": {
                "default": "Make a U-turn",
                "name": "Make a U-turn onto {way_name}",
                "destination": "Make a U-turn towards {destination}"
            }
        },
        "notification": {
            "default": {
                "default": "Continue {modifier}",
                "name": "Continue {modifier} onto {way_name}",
                "destination": "Continue {modifier} towards {destination}"
            },
            "uturn": {
                "default": "Make a U-turn",
                "name": "Make a U-turn onto {way_name}",
                "destination": "Make a U-turn towards {destination}"
            }
        },
        "off ramp": {
            "default": {
                "default": "Take the ramp",
                "name": "Take the ramp onto {way_name}",
                "destination": "Take the ramp towards {destination}",
                "exit": "Take exit {exit}",
                "exit_destination": "Take exit {exit} towards {destination}"
            },
            "left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}",
                "exit": "Take exit {exit} on the left",
                "exit_destination": "Take exit {exit} on the left towards {destination}"
            },
            "right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}",
                "exit": "Take exit {exit} on the right",
                "exit_destination": "Take exit {exit} on the right towards {destination}"
            },
            "sharp left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}",
                "exit": "Take exit {exit} on the left",
                "exit_destination": "Take exit {exit} on the left towards {destination}"
            },
            "sharp right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}",
                "exit": "Take exit {exit} on the right",
                "exit_destination": "Take exit {exit} on the right towards {destination}"
            },
            "slight left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}",
                "exit": "Take exit {exit} on the left",
                "exit_destination": "Take exit {exit} on the left towards {destination}"
            },
            "slight right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}",
                "exit": "Take exit {exit} on the right",
                "exit_destination": "Take exit {exit} on the right towards {destination}"
            }
        },
        "on ramp": {
            "default": {
                "default": "Take the ramp",
                "name": "Take the ramp onto {way_name}",
                "destination": "Take the ramp towards {destination}"
            },
            "left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}"
            },
            "right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}"
            },
            "sharp left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}"
            },
            "sharp right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}"
            },
            "slight left": {
                "default": "Take the ramp on the left",
                "name": "Take the ramp on the left onto {way_name}",
                "destination": "Take the ramp on the left towards {destination}"
            },
            "slight right": {
                "default": "Take the ramp on the right",
                "name": "Take the ramp on the right onto {way_name}",
                "destination": "Take the ramp on the right towards {destination}"
            }
        },
        "rotary": {
            "default": {
                "default": {
                    "default": "Enter the roundabout",
                    "name": "Enter the roundabout and exit onto {way_name}",
                    "destination": "Enter the roundabout and exit towards {destination}"
                },
                "name": {
                    "default": "Enter {rotary_name}",
                    "name": "Enter {rotary_name} and exit onto {way_name}",
                    "destination": "Enter {rotary_name} and exit towards {destination}"
                },
                "exit": {
                    "default": "Enter the roundabout and take the {exit_number} exit",
                    "name": "Enter the roundabout and take the {exit_number} exit onto {way_name}",
                    "destination": "Enter the roundabout and take the {exit_number} exit towards {destination}"
                },
                "name_exit": {
                    "default": "Enter {rotary_name} and take the {exit_number} exit",
                    "name": "Enter {rotary_name} and take the {exit_number} exit onto {way_name}",
                    "destination": "Enter {rotary_name} and take the {exit_number} exit towards {destination}"
                }
            }
        },
        "roundabout": {
            "default": {
                "exit": {
                    "default": "Enter the roundabout and take the {exit_number} exit",
                    "name": "Enter the roundabout and take the {exit_number} exit onto {way_name}",
                    "destination": "Enter the roundabout and take the {exit_number} exit towards {destination}"
                },
                "default": {
                    "default": "Enter the roundabout",
                    "name": "Enter the roundabout and exit onto {way_name}",
                    "destination": "Enter the roundabout and exit towards {destination}"
                }
            }
        },
        "roundabout turn": {
            "default": {
                "default": "Make a {modifier}",
                "name": "Make a {modifier} onto {way_name}",
                "destination": "Make a {modifier} towards {destination}"
            },
            "left": {
                "default": "Turn left",
                "name": "Turn left onto {way_name}",
                "destination": "Turn left towards {destination}"
            },
            "right": {
                "default": "Turn right",
                "name": "Turn right onto {way_name}",
                "destination": "Turn right towards {destination}"
            },
            "straight": {
                "default": "Continue straight",
                "name": "Continue straight onto {way_name}",
                "destination": "Continue straight towards {destination}"
            }
        },
        "exit roundabout": {
            "default": {
                "default": "Exit the roundabout",
                "name": "Exit the roundabout onto {way_name}",
                "destination": "Exit the roundabout towards {destination}"
            }
        },
        "exit rotary": {
            "default": {
                "default": "Exit the roundabout",
                "name": "Exit the roundabout onto {way_name}",
                "destination": "Exit the roundabout towards {destination}"
            }
        },
        "turn": {
            "default": {
                "default": "Make a {modifier}",
                "name": "Make a {modifier} onto {way_name}",
                "destination": "Make a {modifier} towards {destination}",
                "junction_name": "Make a {modifier} at {junction_name}"
            },
            "left": {
                "default": "Turn left",
                "name": "Turn left onto {way_name}",
                "destination": "Turn left towards {destination}",
                "junction_name": "Turn left at {junction_name}"
            },
            "right": {
                "default": "Turn right",
                "name": "Turn right onto {way_name}",
                "destination": "Turn right towards {destination}",
                "junction_name": "Turn right at {junction_name}"
            },
            "straight": {
                "default": "Go straight",
                "name": "Go straight onto {way_name}",
                "destination": "Go straight towards {destination}",
                "junction_name": "Go straight at {junction_name}"
            }
        },
        "use lane": {
            "no_lanes": {
                "default": "Continue straight"
            },
            "default": {
                "default": "{lane_instruction}"
            }
        }
    }
}

},{}]},{},[8]);
