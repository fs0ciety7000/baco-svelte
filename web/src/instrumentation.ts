// Démarrage du serveur Next : tâches de fond du serveur Node (import quotidien du référentiel des trains). La condition
// sur NEXT_RUNTIME est remplacée à la compilation : le module Node n'entre pas dans le paquet edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTimetableScheduler } = await import("./server/timetable/scheduler");
    startTimetableScheduler();
  }
}
