import { Map as MapIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  formatNodeLocation,
  formatOfflineDuration,
  formatSensorValue,
} from '../constants/sensors';
import { NodeHealthStatus, SensorNodeState } from '../types/sensor';

interface IknMapPanelProps {
  nodes: SensorNodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  embedded?: boolean;
}

const MARKER_COLORS: Record<NodeHealthStatus, string> = {
  normal: '#16A34A',
  warning: '#D97706',
  danger: '#B91C1C',
  offline: '#64748B',
};

function buildMarkerHtml(status: NodeHealthStatus, isSelected: boolean): string {
  const bg = MARKER_COLORS[status];
  const pulseClass = status === 'danger' ? 'scada-marker-pulse' : '';
  const ring = isSelected
    ? 'box-shadow: 0 0 0 3px #2563EB, 0 1px 3px rgba(15,23,42,0.35);'
    : '';
  return `<div class="scada-marker-core ${pulseClass}" style="background:${bg};${ring}"></div>`;
}

function buildTooltipHtml(node: SensorNodeState): string {
  const doorLabel = node.door === 'OPEN' ? 'TERBUKA' : 'TERKUNCI';
  const statusLabel =
    node.overallStatus === 'offline'
      ? `OFFLINE (${formatOfflineDuration(node.secondsSinceUpdate)})`
      : node.overallStatus.toUpperCase();

  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4;">
      <div style="font-weight: 700; color: #1E293B;">${node.config.code} • ${node.config.depth}</div>
      <div style="color: #64748B; font-size: 10px; margin-bottom: 3px;">${statusLabel}</div>
      <div>MQ-4: <strong>${formatSensorValue(node.latest.mq4, 0)} ppm</strong></div>
      <div>MQ-135: <strong>${formatSensorValue(node.latest.mq135, 0)} ppm</strong></div>
      <div>Pintu: <strong>${doorLabel}</strong></div>
    </div>
  `;
}

export function IknMapPanel({
  nodes,
  selectedNodeId,
  onSelectNode,
  embedded = false,
}: IknMapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markersRef = useRef<Record<string, import('leaflet').Marker>>({});
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedIdRef = useRef(selectedNodeId);
  selectedIdRef.current = selectedNodeId;

  useEffect(() => {
    let active = true;
    let resizeObserver: ResizeObserver | null = null;

    const initMap = async () => {
      const L = await import('leaflet');
      if (!active || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      for (const node of nodesRef.current) {
        const latLng: [number, number] = [
          node.config.coordinates.lat,
          node.config.coordinates.lng,
        ];
        bounds.extend(latLng);

        const icon = L.divIcon({
          className: 'scada-marker-wrap',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          html: buildMarkerHtml(
            node.overallStatus,
            selectedIdRef.current === node.config.id
          ),
        });

        const marker = L.marker(latLng, { icon })
          .addTo(map)
          .bindTooltip(buildTooltipHtml(node), {
            direction: 'top',
            offset: [0, -8],
            className: 'scada-map-tooltip',
          });

        marker.on('click', () => {
          onSelectNodeRef.current(node.config.id);
        });

        markersRef.current[node.config.id] = marker;
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      } else {
        map.setView([-0.9673, 116.706], 15);
      }

      if (containerRef.current && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(containerRef.current);
      }

      window.setTimeout(() => {
        if (active) map.invalidateSize();
      }, 120);
    };

    void initMap();

    return () => {
      active = false;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = {};
    };
  }, []);

  // Update marker icons & tooltips live without rebuilding the map
  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;

    for (const node of nodes) {
      const marker = markersRef.current[node.config.id];
      if (!marker) continue;

      const isSelected = selectedNodeId === node.config.id;
      marker.setIcon(
        L.divIcon({
          className: 'scada-marker-wrap',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          html: buildMarkerHtml(node.overallStatus, isSelected),
        })
      );
      marker.setTooltipContent(buildTooltipHtml(node));
    }
  }, [nodes, selectedNodeId]);

  const activeNode = nodes.find((n) => n.config.id === selectedNodeId);

  return (
    <section
      className={`flex flex-col min-h-0 flex-1 ${
        embedded
          ? ''
          : 'bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
      }`}
    >
      <div className="px-3.5 py-2 border-b border-[#E2E5EA] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapIcon className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
            Peta Sektor MUT KIPP IKN
          </h2>
        </div>

        {activeNode ? (
          <button
            type="button"
            onClick={() => onSelectNode('all')}
            className="px-2 py-0.5 rounded border border-[#E2E5EA] bg-[#F4F5F7] hover:bg-[#E2E5EA]/60 text-[11px] font-medium text-[#1E293B] cursor-pointer shrink-0"
          >
            Semua Titik
          </button>
        ) : (
          <span className="text-[10px] font-mono-tabular text-[#64748B] truncate">
            Klik marker untuk fokus
          </span>
        )}
      </div>

      <div className="relative flex-1 min-h-[190px] w-full bg-[#F4F5F7]">
        <div ref={containerRef} className="absolute inset-0 z-0" />
      </div>

      <div className="px-3 py-1.5 border-t border-[#E2E5EA] bg-[#F4F5F7]/70 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular text-[#64748B] shrink-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#16A34A]" /> Normal
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#D97706]" /> Waspada
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#B91C1C]" /> Bahaya
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#64748B]" /> Offline
          </span>
        </div>
        {activeNode && (
          <span className="text-[#1E293B] font-semibold truncate">
            {activeNode.config.code} • {formatNodeLocation(activeNode.config)}
          </span>
        )}
      </div>
    </section>
  );
}
