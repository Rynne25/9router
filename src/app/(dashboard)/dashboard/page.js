import { getMachineId } from "@/shared/utils/machine";
import AntigravityCommandCenter from "./antigravity/AntigravityCommandCenter";

export default async function DashboardPage() {
  const machineId = await getMachineId();
  return <AntigravityCommandCenter machineId={machineId} />;
}
