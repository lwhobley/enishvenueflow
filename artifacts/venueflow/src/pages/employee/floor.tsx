import { useAppContext } from "@/hooks/use-app-context";
import { useListTables, getListTablesQueryKey } from "@workspace/api-client-react";

export default function EmployeeFloor() {
  const { activeVenue } = useAppContext();
  
  const { data: tables } = useListTables(
    { venueId: activeVenue?.id || "" },
    {
      query: {
        enabled: !!activeVenue?.id,
        queryKey: getListTablesQueryKey({ venueId: activeVenue?.id || "" }),
        // Stay in sync with manager edits. React Query pauses polling on
        // hidden tabs/backgrounded PWAs; refetchOnWindowFocus catches up
        // on return.
        refetchInterval: 5000,
        refetchOnWindowFocus: true,
      },
    }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'occupied': return 'bg-red-500';
      case 'reserved': return 'bg-yellow-500';
      case 'cleaning': return 'bg-gray-500';
      default: return 'bg-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-green-500"></div> Available</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-500"></div> Occupied</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-yellow-500"></div> Reserved</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-gray-500"></div> Cleaning</div>
      </div>

      <div className="relative w-full h-[600px] bg-card border rounded-lg overflow-hidden">
        {tables?.map(table => (
          <div
            key={table.id}
            className={`absolute flex items-center justify-center text-white font-bold rounded shadow-md ${getStatusColor(table.status)}`}
            style={{
              left: `${table.x}px`,
              top: `${table.y}px`,
              width: `${table.width}px`,
              height: `${table.height}px`,
            }}
          >
            {table.label}
          </div>
        ))}
        {!tables?.length && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No tables defined.
          </div>
        )}
      </div>
    </div>
  );
}
