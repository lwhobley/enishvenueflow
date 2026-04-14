import { useState, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useUpdateVenue, useListRoles, getListRolesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ManagerSettings() {
  const { activeVenue } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    if (activeVenue) {
      setName(activeVenue.name);
      setAddress(activeVenue.address);
      setTimezone(activeVenue.timezone);
    }
  }, [activeVenue]);

  const updateVenue = useUpdateVenue();

  const handleSave = () => {
    if (!activeVenue) return;
    
    updateVenue.mutate({
      id: activeVenue.id,
      data: { name, address, timezone }
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Venue details have been updated." });
        // Should really update context or invalidate venues query here, but context depends on useListVenues
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
      }
    });
  };

  const { data: roles } = useListRoles(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListRolesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Venue Details</CardTitle>
          <CardDescription>Update your venue's basic information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Venue Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={timezone} onChange={e => setTimezone(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={handleSave} disabled={updateVenue.isPending}>
            {updateVenue.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>Roles define permissions and schedule colors for staff.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map(role => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }}></div>
                      <span className="text-sm text-muted-foreground">{role.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!roles?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                    No roles defined.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
