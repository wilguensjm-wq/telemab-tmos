import test from "node:test";
import assert from "node:assert/strict";
import { ReporterService } from "./reporterService.js";
import { StudioService } from "./studioService.js";
import { AssignmentService } from "./assignmentService.js";

test("ReporterService requires fullName and email on create", async () => {
  const reporterService = new ReporterService({
    reporterRepository: {
      create: async () => ({ id: "rep-1" }),
    },
  });

  await assert.rejects(
    () => reporterService.create({ email: "reporter@example.com" }),
    (error) => error?.code === "VALIDATION_ERROR",
  );

  await assert.rejects(
    () => reporterService.create({ fullName: "Reporter One" }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});

test("StudioService validates capacity", async () => {
  const studioService = new StudioService({
    studioRepository: {
      create: async () => ({ id: "stu-1" }),
    },
  });

  await assert.rejects(
    () => studioService.create({ name: "Studio A", location: "HQ", capacity: 0 }),
    (error) => error?.code === "VALIDATION_ERROR",
  );

  await assert.rejects(
    () => studioService.create({ name: "Studio A", location: "HQ", capacity: 1.5 }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});

test("AssignmentService validates reporter and studio references", async () => {
  const assignmentService = new AssignmentService({
    assignmentRepository: {
      create: async () => ({ id: "asg-1" }),
    },
    reporterRepository: {
      findById: async () => null,
    },
    studioRepository: {
      findById: async () => ({ id: "stu-1" }),
    },
  });

  await assert.rejects(
    () => assignmentService.create({
      title: "Morning Live",
      reporterId: "missing-reporter",
      studioId: "stu-1",
    }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});

test("AssignmentService creates assignment when references are valid", async () => {
  const expected = {
    id: "asg-1",
    title: "Morning Live",
    reporterId: "rep-1",
    studioId: "stu-1",
  };

  const assignmentService = new AssignmentService({
    assignmentRepository: {
      create: async (payload) => ({ ...expected, ...payload }),
    },
    reporterRepository: {
      findById: async () => ({ id: "rep-1" }),
    },
    studioRepository: {
      findById: async () => ({ id: "stu-1" }),
    },
  });

  const result = await assignmentService.create({
    title: "Morning Live",
    reporterId: "rep-1",
    studioId: "stu-1",
    priority: "high",
  });

  assert.equal(result.title, "Morning Live");
  assert.equal(result.reporterId, "rep-1");
  assert.equal(result.studioId, "stu-1");
});
