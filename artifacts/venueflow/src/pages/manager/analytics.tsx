import { useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useGetLaborAnalytics, getGetLaborAnalyticsQueryKey, useGetEmployeeAnalytics, getGetEmployeeAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, subDays } from "date-fns";

export default function ManagerAnalytics() {
  const { activeVenue } = useAppContext();
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  
  const { data: laborData } = useGetLaborAnalytics(
    { venueId: activeVenue?.id || "", startDate, endDate },
    { query: { enabled: !!activeVenue?.id, queryKey: getGetLaborAnalyticsQueryKey({ venueId: activeVenue?.id || "", startDate, endDate }) } }
  );

  const { data: employeeData } = useGetEmployeeAnalytics(
    { venueId: activeVenue?.id || "", startDate, endDate },
    { query: { enabled: !!activeVenue?.id, queryKey: getGetEmployeeAnalyticsQueryKey({ venueId: activeVenue?.id || "", startDate, endDate }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Labor Cost</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {laborData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={laborData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="totalCost" stroke="#5B3FD9" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Shifts / Day</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {laborData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={laborData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="scheduledShifts" fill="#10B981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee Hours</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px]">
           {employeeData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="userName" type="category" width={150} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="regularHours" stackId="a" fill="#3B82F6" />
                  <Bar dataKey="overtimeHours" stackId="a" fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
