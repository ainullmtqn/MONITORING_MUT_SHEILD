import { IknMapPanel } from '../components/IknMapPanel';
import { NodeStatusPanel } from '../components/NodeStatusPanel';
import { useMonitoring } from '../context/MonitoringContext';

export function MapAndNodesPage() {
  const {
    nodes,
    sortedNodes,
    selectedNodeId,
    setSelectedNodeId,
    focusNodeInMonitoring,
  } = useMonitoring();

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="min-h-[300px] lg:flex-[1.15] lg:min-h-0 flex flex-col">
        <IknMapPanel
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onViewNodeChart={focusNodeInMonitoring}
        />
      </div>

      <div className="min-h-[220px] lg:flex-[0.85] lg:min-h-0 flex flex-col">
        <NodeStatusPanel
          sortedNodes={sortedNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onViewNodeChart={focusNodeInMonitoring}
        />
      </div>
    </div>
  );
}
