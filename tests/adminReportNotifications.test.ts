import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";

/**
 * Every admin gets a push when a general report (Profile's "Report a
 * problem," or Home's "Give feedback" suggestion — both create a
 * general_reports row) is filed, with a per-admin mute stacked on top of
 * the master push toggle. `listAdminReportRecipients()` is the read that
 * decides who actually gets notified — the send itself (`sendPushToUsers`)
 * is untested here, same as every other push trigger in this app; nothing
 * in the test suite mocks `web-push`.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("listAdminReportRecipients", () => {
  it("includes the admin by default", async () => {
    const recipients = await demoRepo.listAdminReportRecipients();
    expect(recipients).toContain(DEMO_USER_ID);
  });

  it("excludes an admin who has muted this notification", async () => {
    await demoRepo.setNotifyAdminReports(DEMO_USER_ID, false);
    const recipients = await demoRepo.listAdminReportRecipients();
    expect(recipients).not.toContain(DEMO_USER_ID);
  });

  it("includes the admin again once turned back on", async () => {
    await demoRepo.setNotifyAdminReports(DEMO_USER_ID, false);
    await demoRepo.setNotifyAdminReports(DEMO_USER_ID, true);
    const recipients = await demoRepo.listAdminReportRecipients();
    expect(recipients).toContain(DEMO_USER_ID);
  });
});
