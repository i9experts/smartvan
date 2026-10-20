/* eslint-disable prettier/prettier */
// Mirrors the parent app's kGradeLevels (add_kid_screen.dart) — used to
// bucket a kid into primary/secondary for Parent Intelligence filtering.
const PRIMARY_GRADES = new Set(['Pre Nursery', 'Nursery', 'KG', 'G1', 'G2', 'G3', 'G4', 'G5']);

export function academicLevelForGrade(grade?: string): 'primary' | 'secondary' | undefined {
  if (!grade) return undefined;
  return PRIMARY_GRADES.has(grade) ? 'primary' : 'secondary';
}
