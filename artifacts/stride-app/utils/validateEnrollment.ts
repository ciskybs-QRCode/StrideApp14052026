import type { Course } from "@/context/AppDataContext";

const LEVEL_RANK: Record<string, number> = {
  "all levels": -1,
  "beginner": 0,
  "intermediate": 1,
  "advanced": 2,
};

function rankLevel(level: string): number {
  const key = level.toLowerCase().trim();
  return LEVEL_RANK[key] ?? 0;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ParticipantInfo {
  name: string;
  age?: number;
  skillLevel?: string;
}

export function validateEnrollment(participant: ParticipantInfo, course: Course): ValidationResult {
  const issues: string[] = [];

  if (participant.age !== undefined && participant.age > 0) {
    if (participant.age < course.ageMin) {
      issues.push(`Age ${participant.age} is below the minimum of ${course.ageMin} for this course`);
    } else if (course.ageMax < 99 && participant.age > course.ageMax) {
      issues.push(`Age ${participant.age} exceeds the maximum of ${course.ageMax} for this course`);
    }
  }

  if (participant.skillLevel && course.level && course.level !== "All levels") {
    const participantRank = rankLevel(participant.skillLevel);
    const courseRank = rankLevel(course.level);
    if (courseRank > 0 && participantRank < courseRank) {
      issues.push(`${participant.skillLevel} skill level is below the required ${course.level} for this course`);
    }
  }

  if (issues.length === 0) return { valid: true };
  return { valid: false, reason: issues.join("; ") };
}
