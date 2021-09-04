import L from 'leaflet';
import { LineTouchedEvent } from './common/types';
import GeocoderElement, { GeocoderElementsOptions } from './geocoder-element';
import Waypoint from './waypoint';

interface PlanOptions extends GeocoderElementsOptions {
	dragStyles?: L.PathOptions[];
	draggableWaypoints?: boolean;
	routeWhileDragging?: boolean;
	addWaypoints?: boolean;
	reverseWaypoints?: boolean;
	addButtonClassName?: string;
	geocodersClassName?: string;
	createGeocoderElement?: (waypoint: Waypoint, waypointIndex: number, numberOfWaypoints: number, plan: GeocoderElementsOptions) => GeocoderElement;
	createMarker?: (waypointIndex: number, waypoint: Waypoint, numberOfWaypoints?: number) => L.Marker;
}

type LeafletHookedEvent = L.LeafletEvent | { latlng: L.LatLng };

export default class Plan extends L.Layer {
	private readonly defaultOptions = {
		dragStyles: [
			{ color: 'black', opacity: 0.15, weight: 9 },
			{ color: 'white', opacity: 0.8, weight: 6 },
			{ color: 'red', opacity: 1, weight: 2, dashArray: '7,12' }
		],
		draggableWaypoints: true,
		routeWhileDragging: false,
		addWaypoints: true,
		reverseWaypoints: false,
		addButtonClassName: '',
		language: 'en',
		createGeocoderElement: (waypoint: Waypoint, waypointIndex: number, numberOfWaypoints: number, plan: GeocoderElementsOptions) => {
			return new GeocoderElement(waypoint, waypointIndex, numberOfWaypoints, plan);
		},
		createMarker: (waypointIndex: number, waypoint: Waypoint) => {
			const options = {
				draggable: this.options.draggableWaypoints
			};
			
			return L.marker(waypoint.latLng, options);
		},
		geocodersClassName: ''
	};

	options: PlanOptions;

	private waypoints: Waypoint[];
	private newWaypoint?: Waypoint;
	private geocoderContainer?: HTMLDivElement;
	private geocoderElements: GeocoderElement[]  = [];
	private markers: L.Marker[] = [];

	constructor(waypoints: (Waypoint | L.LatLng)[], options?: PlanOptions) {
		super();

		this.options = {
			...this.defaultOptions,
			...options,
		};

		this.waypoints = [];
		this.setWaypoints(waypoints.map((waypoint) => waypoint instanceof Waypoint ? waypoint : new Waypoint(waypoint)));
	}

	isReady() {
		return this.waypoints.every((waypoint) => waypoint.latLng);
	}

	getWaypoints() {
		return [...this.waypoints];
	}

	setWaypoints(waypoints: Waypoint[]) {
		this.spliceWaypoints(0, this.waypoints.length, ...waypoints);
		return this;
	}

	spliceWaypoints(startIndex: number, deleteCount: number = 0, ...newWaypoints: Waypoint[]) {
		this.waypoints.splice(startIndex, deleteCount, ...newWaypoints)

		// Make sure there's always at least two waypoints
		while (this.waypoints.length < 2) {
			this.spliceWaypoints(this.waypoints.length, 0);
		}

		this.updateMarkers();
		this.fireChanged(startIndex, deleteCount, ...newWaypoints);
	}

	onAdd(map: L.Map) {
		this._map = map;
		this.updateMarkers();

		return this;
	}

	onRemove() {
		this.removeMarkers();

		if (this.newWaypoint) {
			for (const line of this.newWaypoint.lines) {
				this._map.removeLayer(line);
			}
		}

		delete this._map;

		return this;
	}

	createGeocoders() {
		const container = L.DomUtil.create('div', `leaflet-routing-geocoders ${this.options.geocodersClassName}`);

		this.geocoderContainer = container;
		this.geocoderElements = [];

		if (this.options.addWaypoints) {
			const addWaypointButton = L.DomUtil.create('button', `leaflet-routing-add-waypoint ${this.options.addButtonClassName}`, container);
			addWaypointButton.setAttribute('type', 'button');
			L.DomEvent.addListener(addWaypointButton, 'click', () => {
				this.spliceWaypoints(this.waypoints.length, 0);
			});
		}

		if (this.options.reverseWaypoints) {
			const reverseButton = L.DomUtil.create('button', 'leaflet-routing-reverse-waypoints', container);
			reverseButton.setAttribute('type', 'button');
			L.DomEvent.addListener(reverseButton, 'click', () => {
				this.waypoints.reverse();
				this.setWaypoints(this.waypoints);
			});
		}

		this.updateGeocoders();
		this.on('waypointsspliced', this.updateGeocoders, this);

		return container;
	}

	private createGeocoder(waypointIndex: number) {
		const { createGeocoderElement = this.defaultOptions.createGeocoderElement } = this.options;
		const geocoder = createGeocoderElement(this.waypoints[waypointIndex], waypointIndex, this.waypoints.length, this.options);
		geocoder.on('delete', () => {
			if (waypointIndex > 0 || this.waypoints.length > 2) {
				this.spliceWaypoints(waypointIndex, 1);
			} else {
				this.spliceWaypoints(waypointIndex, 1, new Waypoint([0, 0]));
			}
		}).on('geocoded', (e) => {
			this.updateMarkers();
			this.fireChanged();
			this.focusGeocoder(waypointIndex + 1);
			this.fire('waypointgeocoded', {
				waypointIndex,
				waypoint: e.waypoint
			});
		}).on('reversegeocoded', (e) => {
			this.fire('waypointgeocoded', {
				waypointIndex,
				waypoint: e.waypoint
			});
		});

		return geocoder;
	}

	private updateGeocoders() {
		for (const geocoderElement of this.geocoderElements) {
			this.geocoderContainer?.removeChild(geocoderElement.getContainer());
		}

		const elements = [...this.waypoints].reverse().map((waypoint) => {
			const geocoderElement = this.createGeocoder(this.waypoints.indexOf(waypoint));
			this.geocoderContainer?.insertBefore(geocoderElement.getContainer(), this.geocoderContainer.firstChild);

			return geocoderElement;
		});

		this.geocoderElements = elements.reverse();
	}

	private removeMarkers() {
		if (this.markers) {
			for (const marker of this.markers) {
				this._map.removeLayer(marker);
			}
		}

		this.markers = [];
	}

	private updateMarkers() {
		if (!this._map) {
			return;
		}

		this.removeMarkers();

		const { createMarker = this.defaultOptions.createMarker } = this.options;
		for (const waypoint of this.waypoints) {
			if (waypoint.latLng) {
				const waypointIndex = this.waypoints.indexOf(waypoint);
				const marker = createMarker(waypointIndex, waypoint, this.waypoints.length);
				if (marker) {
					marker.addTo(this._map);
					if (this.options.draggableWaypoints) {
						this.hookWaypointEvents(marker, waypointIndex);
					}

					this.markers.push(marker);
				}
			}
		}
	}

	private fireChanged(startIndex?: number, deleteCount?: number, ...newWaypoints: Waypoint[]) {
		this.fire('waypointschanged', { waypoints: this.getWaypoints() });

		if (startIndex) {
			this.fire('waypointsspliced', {
				index: startIndex,
				nRemoved: deleteCount,
				added: newWaypoints
			});
		}
	}

	private hookWaypointEvents(marker: L.Marker, waypointIndex: number, trackMouseMove: boolean = false) {
		const eventLatLng = (e: LeafletHookedEvent) => {
			return trackMouseMove ? e.latlng : e.target.getLatLng();
		};
		const dragStart = (e: LeafletHookedEvent) => {
			this.fire('waypointdragstart', { index: waypointIndex, latlng: eventLatLng(e) });
		};

		const drag = (e: LeafletHookedEvent) => {
			this.waypoints[waypointIndex].latLng = eventLatLng(e);
			this.fire('waypointdrag', { index: waypointIndex, latlng: eventLatLng(e) });
		};
		const dragEnd = (e: LeafletHookedEvent) => {
			this.waypoints[waypointIndex].latLng = eventLatLng(e);
			this.waypoints[waypointIndex].name = '';
			if (this.geocoderElements) {
				this.geocoderElements[waypointIndex].update(true);
			}
			this.fire('waypointdragend', { index: waypointIndex, latlng: eventLatLng(e) });
			this.fireChanged();
		};

		if (trackMouseMove) {
			const mouseMove = (e: L.LeafletMouseEvent) => {
				this.markers[waypointIndex].setLatLng(e.latlng);
				drag(e);
			};
			const mouseUp = (e: L.LeafletMouseEvent) => {
				this._map.dragging.enable();
				this._map.off('mouseup', mouseUp, this);
				this._map.off('mousemove', mouseMove, this);
				dragEnd(e);
			};
			this._map.dragging.disable();
			this._map.on('mousemove', mouseMove, this);
			this._map.on('mouseup', mouseUp, this);
			dragStart({ latlng: this.waypoints[waypointIndex].latLng });
		} else {
			marker.on('dragstart', dragStart, this);
			marker.on('drag', drag, this);
			marker.on('dragend', dragEnd, this);
		}
	}

	dragNewWaypoint(e: LineTouchedEvent) {
		const newWaypointIndex = e.afterIndex + 1;
		if (this.options.routeWhileDragging) {
			this.spliceWaypoints(newWaypointIndex, 0, new Waypoint(e.latlng));
			this.hookWaypointEvents(this.markers[newWaypointIndex], newWaypointIndex, true);
		} else {
			this._dragNewWaypoint(newWaypointIndex, e.latlng);
		}
	}

	private _dragNewWaypoint(newWaypointIndex: number, initialLatLng: L.LatLng) {
		const waypoint = new Waypoint(initialLatLng);
		const previousWaypoint = this.waypoints[newWaypointIndex - 1];
		const nextWaypoint = this.waypoints[newWaypointIndex];
		const { createMarker = this.defaultOptions.createMarker } = this.options;
		const marker = createMarker(newWaypointIndex, waypoint, this.waypoints.length + 1);
		const lines: L.Polyline[] = [];
		const draggingEnabled = this._map.dragging.enabled();
		const mouseMove = (e: L.LeafletMouseEvent) => {
			if (marker) {
				marker.setLatLng(e.latlng);
			}
			for (const line of lines) {
				const latLngs = line.getLatLngs();
				latLngs.splice(1, 1, e.latlng);
				line.setLatLngs(latLngs);
			}

			L.DomEvent.stop(e);
		};
		const mouseUp = (e: L.LeafletMouseEvent) => {
			if (marker) {
				this._map.removeLayer(marker);
			}
			for (const line of lines) {
				this._map.removeLayer(line);
			}
			this._map.off('mousemove', mouseMove, this);
			this._map.off('mouseup', mouseUp, this);
			this.spliceWaypoints(newWaypointIndex, 0, new Waypoint(e.latlng));
			if (draggingEnabled) {
				this._map.dragging.enable();
			}

			L.DomEvent.stop(e);
		};

		if (marker) {
			marker.addTo(this._map);
		}

		const { dragStyles = this.defaultOptions.dragStyles } = this.options;
		for (const dragStyle of dragStyles) {
			lines.push(L.polyline([previousWaypoint.latLng, initialLatLng, nextWaypoint.latLng], dragStyle).addTo(this._map));
		}

		if (draggingEnabled) {
			this._map.dragging.disable();
		}

		this._map.on('mousemove', mouseMove, this);
		this._map.on('mouseup', mouseUp,this);
	}

	private focusGeocoder(index: number) {
		if (this.geocoderElements[index]) {
			this.geocoderElements[index].focus();
		} else {
			(document.activeElement as HTMLElement).blur();
		}
	}
}