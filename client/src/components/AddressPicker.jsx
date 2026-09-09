import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, LocateFixed, Loader2, AlertCircle, Check } from 'lucide-react';
import api from '../services/api.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { Field, inputCls } from './ui.jsx';

const pin = L.divIcon({
  className: '',
  html: `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgb(0 0 0 / .25);border:2px solid #2b6a40;font-size:17px;line-height:1">🏠</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/** Lets the customer correct the pin by clicking, since geocoding guesses. */
function ClickToMove({ onMove }) {
  useMapEvents({ click: (e) => onMove({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Recenter({ position }) {
  const map = useMap();
  const { lat, lng } = position || {};

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.setView([lat, lng], 16);
  }, [map, lat, lng]);

  return null;
}

/**
 * Address field that resolves to a point on a map.
 *
 * Geocoding is a guess, so the result is always shown back and stays
 * correctable — drag or click the pin. If nothing resolves the order can still
 * be placed; the app then treats the location as unknown rather than wrong.
 */
export default function AddressPicker({ address, onAddressChange, position, onPositionChange }) {
  const [status, setStatus] = useState('idle');
  const [resolved, setResolved] = useState('');
  const { position: devicePosition, request: askForLocation } = useGeolocation({ ask: false });
  const lastLookup = useRef('');

  const lookup = useCallback(
    async (value) => {
      const query = value.trim();
      if (query.length < 6 || query === lastLookup.current) return;
      lastLookup.current = query;

      setStatus('locating');
      try {
        const { data } = await api.get('/geocode', { params: { q: query } });
        onPositionChange({ lat: data.lat, lng: data.lng });
        setResolved(data.displayName);
        setStatus('found');
      } catch {
        setResolved('');
        setStatus('notfound');
      }
    },
    [onPositionChange]
  );

  // Resolve as the customer pauses, rather than on every keystroke —
  // Nominatim is a donated service and asks for restraint.
  useEffect(() => {
    const id = setTimeout(() => lookup(address), 900);
    return () => clearTimeout(id);
  }, [address, lookup]);

  /** "Use my location": drop the pin, then fill the field from it. */
  const useDeviceLocation = async () => {
    askForLocation();
    setStatus('locating');
  };

  useEffect(() => {
    if (!devicePosition || status !== 'locating') return;
    let cancelled = false;

    (async () => {
      onPositionChange(devicePosition);
      try {
        const { data } = await api.get('/geocode/reverse', { params: devicePosition });
        if (cancelled) return;
        onAddressChange(data.displayName);
        lastLookup.current = data.displayName.trim();
        setResolved(data.displayName);
        setStatus('found');
      } catch {
        if (!cancelled) setStatus('found');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicePosition]);

  const movePin = (next) => {
    onPositionChange(next);
    setStatus('found');
    setResolved('');
  };

  return (
    <div className="space-y-2">
      <Field
        label="Delivery address"
        hint="Include a landmark so the courier finds you quickly."
      >
        <textarea
          required
          rows={3}
          className={inputCls}
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onBlur={() => lookup(address)}
          placeholder="Flat, street, area, city, PIN"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          type="button"
          onClick={useDeviceLocation}
          className="inline-flex items-center gap-1 font-medium text-saffron-600 hover:underline"
        >
          <LocateFixed size={13} /> Use my current location
        </button>

        {status === 'locating' && (
          <span className="inline-flex items-center gap-1 text-stone-500">
            <Loader2 size={12} className="animate-spin" /> Finding this address…
          </span>
        )}
        {status === 'found' && position && (
          <span className="inline-flex items-center gap-1 text-leaf-700">
            <Check size={13} /> Location pinned
          </span>
        )}
        {status === 'notfound' && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertCircle size={13} /> Could not place this address — drop the pin yourself
          </span>
        )}
      </div>

      {resolved && (
        <p className="flex items-start gap-1.5 text-xs text-stone-500">
          <MapPin size={12} className="mt-0.5 shrink-0" /> {resolved}
        </p>
      )}

      {position ? (
        <>
          <div className="h-48 overflow-hidden rounded-xl">
            <MapContainer center={[position.lat, position.lng]} zoom={16} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[position.lat, position.lng]}
                icon={pin}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    movePin({ lat, lng });
                  },
                }}
              />
              <ClickToMove onMove={movePin} />
              <Recenter position={position} />
            </MapContainer>
          </div>
          <p className="text-xs text-stone-400">
            Not quite right? Drag the pin or tap the map to move it.
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 text-xs text-stone-500">
          Type your address and we will show it on a map so you can check it before ordering.
        </p>
      )}
    </div>
  );
}
