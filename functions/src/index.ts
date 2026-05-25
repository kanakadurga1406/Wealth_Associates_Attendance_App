import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const rtdb = admin.database();

// Haversine distance calculator in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Get current date string in IST (Asia/Kolkata)
function getISTDateString(): { dateString: string, currentTime: Date } {
  const utcDate = new Date();
  // GMT+5:30 offset
  const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
  const dateString = istDate.toISOString().split("T")[0];
  return { dateString, currentTime: utcDate };
}

/**
 * markAttendance Callable Cloud Function
 * Validates employee's distance to office and logs check-in/check-out
 */
export const markAttendance = functions.https.onCall(async (request) => {
  // 1. Verify Authentication
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const uid = request.auth.uid;
  const data = request.data || {};
  const { latitude, longitude, type } = data;

  if (typeof latitude !== "number" || typeof longitude !== "number" || !type || !["checkIn", "checkOut"].includes(type)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing or invalid parameters: latitude (number), longitude (number), type ('checkIn' | 'checkOut')"
    );
  }

  try {
    // 2. Fetch User and Role Validation
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("not-found", "User not found in registry.");
    }
    const userData = userDoc.data();
    if (!userData || userData.role !== "EMPLOYEE") {
      throw new functions.https.HttpsError("permission-denied", "Only employees are allowed to mark attendance.");
    }

    // 3. Fetch Employee details to get adminId
    const employeeDoc = await db.collection("employees").doc(uid).get();
    if (!employeeDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Employee profile not found.");
    }
    const employeeData = employeeDoc.data();
    const adminId = employeeData?.adminId;
    if (!adminId) {
      throw new functions.https.HttpsError("failed-precondition", "Employee profile is not linked to any Admin.");
    }

    // 4. Fetch Office Location configured by Admin
    const officeQuery = await db.collection("office_locations").where("adminId", "==", adminId).limit(1).get();
    if (officeQuery.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Your office location settings have not been configured by the Admin."
      );
    }
    const officeDoc = officeQuery.docs[0];
    const officeData = officeDoc.data();
    const officeLat = officeData.latitude;
    const officeLng = officeData.longitude;
    const officeRadius = officeData.radius || 10; // Default to 10 meters if not set

    // 5. Calculate Distance using Haversine Formula
    const distance = getDistance(latitude, longitude, officeLat, officeLng);

    // 6. Geofence Enforcement (Allow 1m margin of error, so 11m if set to 10m)
    if (distance > officeRadius) {
      // Log failed attempt in activity_logs
      await db.collection("activity_logs").add({
        employeeId: uid,
        activity: `Attempted ${type === "checkIn" ? "Check-In" : "Check-Out"} failed: Outside geofence (${Math.round(distance)}m from office)`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: false,
        distance: Math.round(distance),
        allowedRadius: officeRadius,
        message: `Geofence failed. You are outside the allowed office boundary (${Math.round(distance)}m away).`,
      };
    }

    // 7. Process Check-In / Check-Out
    const { dateString, currentTime } = getISTDateString();
    const attendanceQuery = await db.collection("attendance")
      .where("employeeId", "==", uid)
      .where("date", "==", dateString)
      .limit(1)
      .get();

    if (type === "checkIn") {
      if (!attendanceQuery.empty) {
        return {
          success: false,
          message: "You have already checked in for today.",
        };
      }

      // Check if late (e.g. past 9:15 AM IST)
      // IST is UTC + 5:30. Let's calculate hours/minutes in IST
      const istHours = (currentTime.getUTCHours() + 5 + Math.floor((currentTime.getUTCMinutes() + 30) / 60)) % 24;
      const istMinutes = (currentTime.getUTCMinutes() + 30) % 60;
      let status = "Present";
      
      // Mark Late if after 09:15 AM
      if (istHours > 9 || (istHours === 9 && istMinutes > 15)) {
        status = "Late";
      }

      const newAttendance = {
        employeeId: uid,
        checkIn: admin.firestore.FieldValue.serverTimestamp(),
        checkOut: null,
        latitude,
        longitude,
        status,
        workingHours: 0,
        date: dateString,
      };

      const docRef = await db.collection("attendance").add(newAttendance);

      // Log success activity
      await db.collection("activity_logs").add({
        employeeId: uid,
        activity: `Checked in successfully (Status: ${status})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update Live Database presence tracker
      await rtdb.ref(`status/users/${uid}`).update({
        checkInStatus: "checked-in",
        lastCheckIn: admin.database.ServerValue.TIMESTAMP,
        currentActivity: "Checked-in",
      });

      return {
        success: true,
        id: docRef.id,
        status,
        message: `Check-in successful. Status: ${status}`,
      };
    } else {
      // type === 'checkOut'
      if (attendanceQuery.empty) {
        return {
          success: false,
          message: "No check-in record found for today. You must check in first.",
        };
      }

      const attendanceDoc = attendanceQuery.docs[0];
      const attendanceData = attendanceDoc.data();

      if (attendanceData.checkOut) {
        return {
          success: false,
          message: "You have already checked out for today.",
        };
      }

      const checkInTime = attendanceData.checkIn.toDate();
      const checkOutTime = currentTime;
      const workingHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

      await attendanceDoc.ref.update({
        checkOut: admin.firestore.FieldValue.serverTimestamp(),
        workingHours: Number(workingHours.toFixed(2)),
      });

      // Log success activity
      await db.collection("activity_logs").add({
        employeeId: uid,
        activity: `Checked out successfully (Hours: ${workingHours.toFixed(2)})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update Live Database presence tracker
      await rtdb.ref(`status/users/${uid}`).update({
        checkInStatus: "checked-out",
        lastCheckOut: admin.database.ServerValue.TIMESTAMP,
        currentActivity: "Checked-out",
      });

      return {
        success: true,
        id: attendanceDoc.id,
        workingHours: Number(workingHours.toFixed(2)),
        message: `Check-out successful. Total hours: ${workingHours.toFixed(2)}h`,
      };
    }
  } catch (error: any) {
    console.error("markAttendance error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "An error occurred while marking attendance."
    );
  }
});

/**
 * triggerAutoMarkAbsent Callable Cloud Function (Manual or Cron trigger support)
 * Scans all employees and marks them Absent if no attendance logged for today.
 */
export const triggerAutoMarkAbsent = functions.https.onCall(async (request) => {
  // Validate caller role (Only Super Admin or Admin)
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  
  const callerUid = request.auth.uid;
  
  try {
    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.data();
    if (!callerData || !["SUPER_ADMIN", "ADMIN"].includes(callerData.role)) {
      throw new functions.https.HttpsError("permission-denied", "Unauthorized tool access.");
    }

    const { dateString } = getISTDateString();
    
    // Fetch all active employees
    let employeesQuery;
    if (callerData.role === "ADMIN") {
      employeesQuery = await db.collection("employees").where("adminId", "==", callerUid).get();
    } else {
      employeesQuery = await db.collection("employees").get();
    }

    if (employeesQuery.empty) {
      return { success: true, processed: 0, message: "No employees to check." };
    }

    let markedCount = 0;

    for (const employeeDoc of employeesQuery.docs) {
      const empUid = employeeDoc.id;

      // Check if attendance already exists for today
      const attendanceQuery = await db.collection("attendance")
        .where("employeeId", "==", empUid)
        .where("date", "==", dateString)
        .limit(1)
        .get();

      if (attendanceQuery.empty) {
        // Create absent record
        await db.collection("attendance").add({
          employeeId: empUid,
          checkIn: null,
          checkOut: null,
          latitude: 0,
          longitude: 0,
          status: "Absent",
          workingHours: 0,
          date: dateString,
        });

        // Log in activities
        await db.collection("activity_logs").add({
          employeeId: empUid,
          activity: "Auto-marked Absent (No check-in recorded by day end)",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        markedCount++;
      }
    }

    return {
      success: true,
      processed: employeesQuery.docs.length,
      markedAbsent: markedCount,
      message: `Successfully audited employees. ${markedCount} marked Absent.`,
    };
  } catch (error: any) {
    console.error("triggerAutoMarkAbsent error:", error);
    throw new functions.https.HttpsError("internal", error.message || "Auditing failed.");
  }
});

/**
 * createUserAccount Callable Cloud Function
 * Creates a new user in Firebase Auth and populates user metadata in Firestore
 */
export const createUserAccount = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }

  const callerUid = request.auth.uid;
  const data = request.data || {};
  const { email, password, name, role, department, phone } = data;

  if (!email || !password || !name || !role || !["ADMIN", "EMPLOYEE"].includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing or invalid parameters: email, password, name, role ('ADMIN' | 'EMPLOYEE')"
    );
  }

  try {
    // 1. Fetch caller profile to verify authorization
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Caller profile not found.");
    }
    const callerData = callerDoc.data();
    const callerRole = callerData?.role;

    // Rules:
    // - SUPER_ADMIN can create ADMINs (or EMPLOYEEs)
    // - ADMIN can create EMPLOYEEs
    if (role === "ADMIN" && callerRole !== "SUPER_ADMIN") {
      throw new functions.https.HttpsError("permission-denied", "Only Super Admins can create Admins.");
    }
    if (role === "EMPLOYEE" && !["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new functions.https.HttpsError("permission-denied", "Unauthorized to create Employee profile.");
    }

    // 2. Create the user in Firebase Auth using admin SDK
    const userRecord = await admin.auth().createUser({
      email: email.trim(),
      password: password,
      displayName: name,
    });

    const newUid = userRecord.uid;

    // 3. Write basic user record to Firestore users collection
    const newUser = {
      uid: newUid,
      name,
      email: email.trim().toLowerCase(),
      role,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(role === "EMPLOYEE" ? { adminId: callerRole === "ADMIN" ? callerUid : (callerData?.adminId || callerUid) } : {}),
    };
    await db.collection("users").doc(newUid).set(newUser);

    // 4. Role-specific collection initialization
    if (role === "ADMIN") {
      await db.collection("admins").doc(newUid).set({
        uid: newUid,
        createdBy: callerUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (role === "EMPLOYEE") {
      await db.collection("employees").doc(newUid).set({
        uid: newUid,
        adminId: callerRole === "ADMIN" ? callerUid : (callerData?.adminId || callerUid),
        department: department || "General",
        phone: phone || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 5. Log activity
    await db.collection("activity_logs").add({
      employeeId: callerUid,
      activity: `Created user account: ${name} (${role})`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      uid: newUid,
      message: `User ${name} (${role}) created successfully.`,
    };
  } catch (error: any) {
    console.error("createUserAccount error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to create user account."
    );
  }
});
