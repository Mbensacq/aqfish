/**
 * Lecture d'une sauvegarde au schéma 2 (#264, ADR 0069) dans les tests de bout en bout : le
 * corps du monde du bac sélectionné (même forme que le corps d'un monde du schéma 1).
 */
export function selectedTankWorld<T>(text: string): T {
  const doc = JSON.parse(text) as {
    selectedTankId: number;
    tanks: { id: number; world: T }[];
  };
  const tank = doc.tanks.find((t) => t.id === doc.selectedTankId);
  if (tank === undefined) {
    throw new Error('sauvegarde sans bac sélectionné');
  }
  return tank.world;
}
