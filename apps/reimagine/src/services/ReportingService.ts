import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
    type FormCarryResponse,
    REPORT_REASONS,
    type ReportImageData,
    type ReportResult,
    type ReportSubmissionData,
} from "../types/reporting";

interface PendingReport extends ReportImageData {
    id: string;
    submittedAt: string;
    retryCount: number;
}

export const getConfig = () => {
    const { FORMCARRY_ENDPOINT, ADMIN_EMAIL, FROM_EMAIL } =
        Constants.expoConfig.extra;
    return { FORMCARRY_ENDPOINT, ADMIN_EMAIL, FROM_EMAIL };
};

class ReportingService {
    private static readonly FORMCARRY_ENDPOINT = getConfig().FORMCARRY_ENDPOINT;
    private static readonly PENDING_REPORTS_KEY = "pending_reports";
    private static readonly MAX_RETRY_ATTEMPTS = 3;
    private static readonly ADMIN_EMAIL = getConfig().ADMIN_EMAIL;
    private static readonly FROM_EMAIL = getConfig().FROM_EMAIL;

    static async reportImage(
        reportData: ReportImageData,
    ): Promise<ReportResult> {
        try {
            console.log(
                "FORMCARRY_ENDPOINT",
                ReportingService.FORMCARRY_ENDPOINT,
            );
            console.log("📋 Reporting image:", {
                imageId: reportData.imageId,
                source: reportData.source,
                reason: reportData.reason,
            });

            const emailData = ReportingService.prepareEmailData(reportData);
            const result = await ReportingService.sendReport(emailData);

            if (result.success) {
                console.log("✅ Report sent successfully");
                return {
                    success: true,
                    message:
                        "Report sent successfully. Thank you for helping us maintain a safe community.",
                };
            } else {
                console.log("❌ Failed to send report, saving for later retry");
                await ReportingService.savePendingReport(reportData);

                return {
                    success: false,
                    message:
                        "Report saved. We will process it as soon as possible.",
                    error: result.error,
                };
            }
        } catch (error) {
            console.error("📋 Error in reportImage:", error);
            await ReportingService.savePendingReport(reportData);

            return {
                success: false,
                message:
                    "Report saved offline. We will process it when connection is restored.",
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    private static prepareEmailData(
        reportData: ReportImageData,
    ): ReportSubmissionData {
        const reasonLabel =
            REPORT_REASONS.find((r) => r.id === reportData.reason)?.label ||
            reportData.reason;

        const _subject = "Image Report - Reimagine App";

        const message = `
IMAGE REPORT - REIMAGINE

Report Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Image ID: ${reportData.imageId}
• Source: ${reportData.source.toUpperCase()}
• Image URL: ${reportData.imageUrl}
• Reason: ${reasonLabel}

Prompt (if available):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.prompt || "No prompt available"}

User Comment:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.userComment || "No additional comment provided"}

Technical Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Platform: ${reportData.deviceInfo.platform}
• App Version: ${reportData.deviceInfo.version}
• Timestamp: ${reportData.deviceInfo.timestamp}

Action Required:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please review this image and update the banned_images.json file if necessary.

To ban this image, add the following entry to the JSON file:
{
  "id": "${reportData.imageId}",
  "source": "${reportData.source}",
  "reason": "${reasonLabel}",
  "dateAdded": "${new Date().toISOString()}",
  "adminNotes": ""
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated report from ReImagine App.
    `.trim();

        return {
            name: "Reimagine User",
            email: ReportingService.FROM_EMAIL,
            message: message,
        };
    }

    private static async sendReport(
        emailData: ReportSubmissionData,
    ): Promise<ReportResult> {
        try {
            console.log("📮 Sending report via FormCarry...");

            const response = await fetch(ReportingService.FORMCARRY_ENDPOINT, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: emailData.name,
                    email: emailData.email,
                    message: emailData.message,
                    _gotcha: "",
                    subject: "Image Report - Reimagine App",
                    _replyto: ReportingService.FROM_EMAIL,
                    _to: ReportingService.ADMIN_EMAIL,
                }),
            });

            const responseData: FormCarryResponse = await response.json();

            console.log("📮 FormCarry response:", responseData);

            if (responseData.code === 200) {
                return {
                    success: true,
                    message: "Report sent successfully",
                };
            } else {
                return {
                    success: false,
                    message: responseData.message || "Failed to send report",
                    error: `FormCarry error: ${responseData.code} - ${responseData.message}`,
                };
            }
        } catch (error) {
            console.error("📮 Error sending report:", error);
            return {
                success: false,
                message: "Network error occurred",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown network error",
            };
        }
    }

    private static async savePendingReport(
        reportData: ReportImageData,
    ): Promise<void> {
        try {
            const pendingReports = await ReportingService.getPendingReports();

            const pendingReport: PendingReport = {
                ...reportData,
                id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                submittedAt: new Date().toISOString(),
                retryCount: 0,
            };

            pendingReports.push(pendingReport);

            await AsyncStorage.setItem(
                ReportingService.PENDING_REPORTS_KEY,
                JSON.stringify(pendingReports),
            );

            console.log("💾 Saved pending report:", pendingReport.id);
        } catch (error) {
            console.error("💾 Error saving pending report:", error);
        }
    }

    private static async getPendingReports(): Promise<PendingReport[]> {
        try {
            const reportsJson = await AsyncStorage.getItem(
                ReportingService.PENDING_REPORTS_KEY,
            );
            return reportsJson ? JSON.parse(reportsJson) : [];
        } catch (error) {
            console.error("📋 Error getting pending reports:", error);
            return [];
        }
    }

    static async retryPendingReports(): Promise<{
        sent: number;
        failed: number;
    }> {
        try {
            const pendingReports = await ReportingService.getPendingReports();

            if (pendingReports.length === 0) {
                return { sent: 0, failed: 0 };
            }

            console.log(
                `🔄 Retrying ${pendingReports.length} pending reports...`,
            );

            let sentCount = 0;
            let failedCount = 0;
            const remainingReports: PendingReport[] = [];

            for (const report of pendingReports) {
                if (report.retryCount >= ReportingService.MAX_RETRY_ATTEMPTS) {
                    console.log(
                        `❌ Report ${report.id} exceeded max retry attempts, discarding`,
                    );
                    failedCount++;
                    continue;
                }

                const emailData = ReportingService.prepareEmailData(report);
                const result = await ReportingService.sendReport(emailData);

                if (result.success) {
                    console.log(
                        `✅ Successfully sent pending report ${report.id}`,
                    );
                    sentCount++;
                } else {
                    console.log(
                        `❌ Failed to send pending report ${report.id}, retry count: ${report.retryCount + 1}`,
                    );
                    report.retryCount++;
                    remainingReports.push(report);
                    failedCount++;
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            await AsyncStorage.setItem(
                ReportingService.PENDING_REPORTS_KEY,
                JSON.stringify(remainingReports),
            );

            console.log(
                `🔄 Retry completed: ${sentCount} sent, ${failedCount} failed`,
            );

            return { sent: sentCount, failed: failedCount };
        } catch (error) {
            console.error("🔄 Error retrying pending reports:", error);
            return { sent: 0, failed: 0 };
        }
    }

    static getDeviceInfo(): ReportImageData["deviceInfo"] {
        return {
            platform: Platform.OS,
            version:
                Constants.expoConfig?.version ||
                Constants.manifest?.version ||
                "1.0.0",
            timestamp: new Date().toISOString(),
        };
    }

    static validateReportData(
        reportData: Partial<ReportImageData>,
    ): string | null {
        if (!reportData.imageId || !reportData.imageId.trim()) {
            return "Image ID is required";
        }

        if (!reportData.imageUrl || !reportData.imageUrl.trim()) {
            return "Image URL is required";
        }

        if (
            !reportData.source ||
            !["lexica", "civitai", "local"].includes(reportData.source)
        ) {
            return "Valid source is required (lexica or civitai)";
        }

        if (!reportData.reason || !reportData.reason.trim()) {
            return "Reason is required";
        }

        const validReasons = REPORT_REASONS.map((r) => r.id);
        if (!validReasons.includes(reportData.reason as any)) {
            return "Invalid reason provided";
        }

        return null; // Validation passed
    }
}

export { ReportingService };
export default ReportingService;
