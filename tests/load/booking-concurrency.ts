import { BookingService } from "../../src/server/services/booking.service";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { db } from "../../src/db";
import { bookingWindows, bookings } from "../../src/db/schema";
import { eq } from "drizzle-orm";

async function runConcurrencyLoadTest() {
  console.log("⚡ Starting High-Concurrency Booking Simulation Load Test...\n");

  const groups = await AcademicService.getGroups();
  const sections = await AcademicService.getSectionsByGroup(groups[0].id);

  const testGroup = groups[0];
  const testSection = sections[0];

  const CAPACITY = 10;
  const CONCURRENT_STUDENTS = 25;

  console.log(`📋 Parameters: Window Capacity = ${CAPACITY}, Concurrent Requestors = ${CONCURRENT_STUDENTS}`);

  // 1. Create fresh test booking window
  const [window] = await db
    .insert(bookingWindows)
    .values({
      groupId: testGroup.id,
      sectionId: testSection.id,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3600000),
      capacity: CAPACITY,
      status: "OPEN",
      nextQueueNumber: 1,
    })
    .returning();

  console.log(`⏱️ Created Booking Window: ${window.id}`);

  // 2. Prepare registered students
  console.log(`⏳ Pre-registering ${CONCURRENT_STUDENTS} students...`);
  const studentsList: any[] = [];
  for (let i = 0; i < CONCURRENT_STUDENTS; i++) {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const reg = await StudentService.registerStudent({
      fullName: `طالب اختبار الضغط ${i + 1} حسن`,
      academicNumber: `LOAD_AC_${Date.now()}_${i}`,
      nationalId: `30301010${rand}`,
      groupId: testGroup.id,
      sectionId: testSection.id,
    });
    studentsList.push(reg.student);
  }
  console.log(`✅ All ${CONCURRENT_STUDENTS} students pre-registered.`);

  // 3. Fire simultaneous booking requests
  console.log(`\n🚀 Firing ${CONCURRENT_STUDENTS} simultaneous booking requests...`);
  const startTime = Date.now();

  const promises = studentsList.map(async (st) => {
    const reqStart = Date.now();
    try {
      const res = await BookingService.createBooking(st.id, window.id);
      const latency = Date.now() - reqStart;
      return { success: true, queueNumber: res.booking.queueNumber, latency };
    } catch (err: any) {
      const latency = Date.now() - reqStart;
      return { success: false, error: err.message, latency };
    }
  });

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;

  // 4. Analyze results
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const latencies = results.map((r) => r.latency);

  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);

  const allocatedQueueNumbers = successful.map((s) => s.queueNumber);
  const uniqueQueueNumbers = new Set(allocatedQueueNumbers);

  console.log("\n================ LOAD TEST RESULTS ================");
  console.log(`Total Requests:             ${CONCURRENT_STUDENTS}`);
  console.log(`Successful Bookings:        ${successful.length} (Expected: ${CAPACITY})`);
  console.log(`Capacity Exhausted Rejects: ${failed.length} (Expected: ${CONCURRENT_STUDENTS - CAPACITY})`);
  console.log(`Duplicate Queue Numbers:    ${allocatedQueueNumbers.length - uniqueQueueNumbers.size} (Must be 0)`);
  console.log(`Total Execution Time:       ${totalDuration} ms`);
  console.log(`Average Latency:            ${avgLatency} ms`);
  console.log(`Min Latency:                ${minLatency} ms`);
  console.log(`Max Latency:                ${maxLatency} ms`);
  console.log("===================================================\n");

  if (successful.length === CAPACITY && uniqueQueueNumbers.size === CAPACITY) {
    console.log("🎉 CONCURRENCY TEST PASSED! Perfect capacity enforcement and zero duplicates.");
    process.exit(0);
  } else {
    console.error("❌ Concurrency test failed validation criteria.");
    process.exit(1);
  }
}

runConcurrencyLoadTest().catch((err) => {
  console.error("Load test error:", err);
  process.exit(1);
});
