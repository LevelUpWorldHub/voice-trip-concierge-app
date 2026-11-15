"use client";

import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Itinerary } from "@/lib/types";

export default function MapCanvas({ itinerary, dayIndex }: { itinerary: Itinerary; dayIndex: number }) {
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  if (!day) return null;
  const line = day.geometry.length > 1 ? day.geometry : day.stops.map((stop) => [stop.lat, stop.lon] as [number, number]);
  return (
    <MapContainer
      center={[day.stops[0]?.lat ?? itinerary.center.lat, day.stops[0]?.lon ?? itinerary.center.lon]}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: "22rem", width: "100%" }}
      className="w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {line.length > 1 ? <Polyline positions={line} pathOptions={{ color: "#e2b15a", weight: 4 }} /> : null}
      {day.stops.map((stop, index) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lon]}
          radius={10}
          pathOptions={{ color: "#1c1408", weight: 2, fillColor: "#e2b15a", fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            {index + 1}. {stop.name}
          </Tooltip>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.arrival}–{stop.depart}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
