import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapPositionController({ position, onPositionChange }) {
  const map = useMap();

  useMapEvents({
    click(event) {
      onPositionChange(event.latlng.lat, event.latlng.lng);
    },
  });

  useEffect(() => {
    map.setView(position, 17);
  }, [map, position]);

  return null;
}

export default function AddressPinMap({ latitude, longitude, onPositionChange }) {
  const markerRef = useRef(null);
  const position = useMemo(() => [Number(latitude), Number(longitude)], [latitude, longitude]);
  const markerEvents = useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (!marker) return;
      const nextPosition = marker.getLatLng();
      onPositionChange(nextPosition.lat, nextPosition.lng);
    },
  }), [onPositionChange]);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#dce5d8] bg-white">
      <MapContainer center={position} zoom={17} scrollWheelZoom className="h-[280px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapPositionController position={position} onPositionChange={onPositionChange} />
        <Marker ref={markerRef} position={position} draggable eventHandlers={markerEvents}>
          <Popup>Drag this pin or click the map to adjust your exact delivery location.</Popup>
        </Marker>
      </MapContainer>
      <p className="border-t border-[#e8eee6] px-4 py-3 text-xs text-[#5e6f65]">
        Drag the pin or click anywhere on the map to adjust the saved location.
      </p>
    </div>
  );
}
