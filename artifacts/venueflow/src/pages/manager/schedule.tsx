import { useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { 
  useListSchedules, getListSchedulesQueryKey,
  useCreateSchedule,
  useListShifts, getListShiftsQueryKey,
  useListRoles, getListRolesQueryKey,
  useListUsers, getListUsersQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ManagerSchedule() {
  const { activeVenue } = useAppContext();
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  });

  const { data: schedules } = useListSchedules(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListSchedulesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const currentSchedule = schedules?.find(s => s.weekStart === weekStart);

  const { data: shifts } = useListShifts(
    { scheduleId: currentSchedule?.id || "", venueId: activeVenue?.id || "" },
    { query: { enabled: !!currentSchedule?.id, queryKey: getListShiftsQueryKey({ scheduleId: currentSchedule?.id || "", venueId: activeVenue?.id || "" }) } }
  );

  const { data: roles } = useListRoles(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListRolesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const { data: users } = useListUsers(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListUsersQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Add Shift
        </Button>
      </div>

      <div className="bg-card border rounded-md p-8 text-center text-muted-foreground">
        Schedule grid for week {weekStart}
        {currentSchedule ? (
          <div className="mt-4 text-sm">
            {shifts?.length || 0} shifts scheduled.
          </div>
        ) : (
          <div className="mt-4">
            No schedule for this week.
          </div>
        )}
      </div>
    </div>
  );
}
