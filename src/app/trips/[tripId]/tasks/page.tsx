import { TaskList } from "@/components/tasks/task-list";
import { todayKey } from "@/lib/format";
import { getTripTasks } from "@/server/queries";

export default async function TripTasksPage({ params }: PageProps<"/trips/[tripId]/tasks">) {
  const { tripId } = await params;
  const tasks = await getTripTasks(tripId);
  return <TaskList tripId={tripId} tasks={tasks} today={todayKey()} />;
}
