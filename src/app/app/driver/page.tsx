import { requirePagePermission } from "@/lib/auth/page-guard";
import { listDriverTasks } from "@/lib/domain/shipments";
import { DriverTaskList } from "@/components/app/driver-task-list";
import { Notice } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "As minhas tarefas" };

export default async function DriverPage() {
  const user = await requirePagePermission("tasks:read_own");

  if (!user.driverId) {
    return (
      <Notice tone="warning" title="Perfil de motorista não encontrado">
        A sua conta não está associada a um perfil de condução. Peça a um administrador para criar o utilizador com a
        função «Motorista».
      </Notice>
    );
  }

  const tasks = await listDriverTasks(user.driverId, user.organizationId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{formatDate(new Date().toISOString())}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">As minhas tarefas</h1>
        <p className="mt-1 text-xs text-muted">
          {tasks.length} paragens ativas · {tasks.filter((task) => task.routeDate === today).length} para hoje
        </p>
      </div>

      <Notice tone="info" title="Funcionamento no terreno">
        A entrega só é confirmada com prova registada e resposta do servidor. Se a ligação falhar, a ação não é
        marcada como concluída — reforce o sinal e repita. A localização é registada apenas quando autoriza no
        dispositivo.
      </Notice>

      <DriverTaskList tasks={tasks} />
    </div>
  );
}
