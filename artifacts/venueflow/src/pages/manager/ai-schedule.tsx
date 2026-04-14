import { useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useAiGenerateSchedule, useCreateSchedule, getListSchedulesQueryKey, usePublishSchedule } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ManagerAISchedule() {
  const { activeVenue } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  });
  const [laborTarget, setLaborTarget] = useState("20");
  const [notes, setNotes] = useState("");

  const aiGenerate = useAiGenerateSchedule();

  const handleGenerate = () => {
    if (!activeVenue) return;
    
    aiGenerate.mutate({
      data: {
        venueId: activeVenue.id,
        weekStart,
        laborTargetPct: parseFloat(laborTarget),
        notes
      }
    }, {
      onSuccess: (data) => {
        toast({
          title: "Schedule Generated",
          description: data.summary,
        });
        queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey({ venueId: activeVenue.id }) });
      },
      onError: (error) => {
        toast({
          title: "Generation Failed",
          description: "There was an error generating the schedule.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">AI Schedule Generator</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Generate Schedule</CardTitle>
          <CardDescription>
            Let AI build an optimal schedule based on past labor data, target percentages, and staff availability.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Week Start Date</Label>
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Labor Target %</Label>
            <Input type="number" value={laborTarget} onChange={(e) => setLaborTarget(e.target.value)} min="1" max="100" />
          </div>
          <div className="space-y-2">
            <Label>Notes / Special Requirements</Label>
            <Textarea 
              placeholder="e.g. Ensure Bob gets 30 hours, need extra staff for Friday event" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
            />
          </div>
          
          <Button onClick={handleGenerate} disabled={aiGenerate.isPending} className="w-full">
            <Wand2 className="w-4 h-4 mr-2" />
            {aiGenerate.isPending ? "Generating..." : "Generate Schedule"}
          </Button>

          {aiGenerate.data && (
            <div className="mt-6 p-4 bg-muted rounded-md text-sm">
              <h3 className="font-bold mb-2">Generation Result</h3>
              <p>{aiGenerate.data.summary}</p>
              <p className="mt-2 text-muted-foreground">{aiGenerate.data.shifts.length} shifts created.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
