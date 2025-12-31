import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { OptimizedImage } from "../components/OptimizedImage";
import ReportImageModal from "../components/ReportImageModal";
import { useTheme } from "../context/ThemeContext";
import type { RootStackScreenProps } from "../navigation/types";
import ImageUploadService from "../services/ImageUploadService";
import TransformationService from "../services/TransformationService";
import type { TransformationChain } from "../types/transformation";

export default function TransformationDetailScreen({
    navigation,
    route,
}: RootStackScreenProps<"TransformationDetail">) {
    const { theme } = useTheme();
    const { width } = useWindowDimensions();
    const [chain, setChain] = useState<TransformationChain>(route.params.chain);
    const [currentVersionId, setCurrentVersionId] = useState(
        chain.currentVersionId,
    );
    const [downloading, setDownloading] = useState(false);
    const [copiedText, setCopiedText] = useState<string | null>(null);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [uploadingForReport, setUploadingForReport] = useState(false);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(
        null,
    );

    const isMountedRef = useRef(true);

    useFocusEffect(
        React.useCallback(() => {
            // Reload chain data when screen is focused
            const reloadChain = async () => {
                const updatedChain = await TransformationService.getChain(
                    chain.id,
                );
                if (updatedChain) {
                    setChain(updatedChain);
                    setCurrentVersionId(updatedChain.currentVersionId);
                }
            };
            reloadChain();
        }, [chain.id]),
    );
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const currentVersion = chain.versions.find(
        (v) => v.id === currentVersionId,
    );

    // useEffect(() => {
    //   console.log('TransformationDetailScreen mounted:', {
    //     chainId: chain.id,
    //     versionsCount: chain.versions.length,
    //     currentVersion: currentVersionId,
    //   });
    // }, []);

    const handleVersionSelect = async (versionId: string) => {
        setCurrentVersionId(versionId);
        await TransformationService.setCurrentVersion(chain.id, versionId);
    };

    const handleToggleFavorite = async (versionId: string) => {
        const success = await TransformationService.toggleFavorite(
            chain.id,
            versionId,
        );
        if (success) {
            // Reload chain data
            const updatedChain = await TransformationService.getChain(chain.id);
            if (updatedChain) {
                setChain(updatedChain);
            }
        }
    };

    const handleContinueTransformation = () => {
        // Navigate back to EditScreen with current chain
        navigation.navigate("EditScreen", {
            selectedImages: chain.sourceImages,
            chainId: chain.id,
        });
    };

    const handleDownload = async () => {
        if (!currentVersion) return;

        try {
            setDownloading(true);

            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== "granted") {
                Alert.alert(
                    "Permission Required",
                    "Please grant media library permissions to download",
                );
                return;
            }

            // Check if it's already a local file or a URL
            const sourceUri = currentVersion.resultUrl;

            // If it's already a local file, copy it
            if (sourceUri.startsWith("file://")) {
                const asset = await MediaLibrary.createAssetAsync(sourceUri);
                await MediaLibrary.createAlbumAsync("ReImagine", asset, false);
                Alert.alert("Success", "Image saved to gallery!");
            } else {
                // If it's a URL, download it first
                const filename = `reimagine_v${currentVersion.versionNumber}_${Date.now()}.jpg`;
                const fileUri = FileSystem.documentDirectory + filename;
                await FileSystem.downloadAsync(sourceUri, fileUri);

                const asset = await MediaLibrary.createAssetAsync(fileUri);
                await MediaLibrary.createAlbumAsync("ReImagine", asset, false);
                Alert.alert("Success", "Image saved to gallery!");
            }
        } catch (error) {
            console.error("Download error:", error);
            Alert.alert("Error", "Failed to download image");
        } finally {
            setDownloading(false);
        }
    };

    const handleShare = async () => {
        if (!currentVersion) return;

        try {
            let shareUri = currentVersion.resultUrl;

            // If it's a URL, download it first
            if (!shareUri.startsWith("file://")) {
                const filename = `reimagine_v${currentVersion.versionNumber}_${Date.now()}.jpg`;
                const fileUri = FileSystem.documentDirectory + filename;
                await FileSystem.downloadAsync(shareUri, fileUri);
                shareUri = fileUri;
            }

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(shareUri);
            } else {
                Alert.alert("Error", "Sharing is not available on this device");
            }
        } catch (error) {
            console.error("Share error:", error);
            Alert.alert("Error", "Failed to share image");
        }
    };

    const handleReport = async () => {
        if (!currentVersion) return;

        try {
            setUploadingForReport(true);
            const imageUri = currentVersion.resultUrl;

            // Check if image is local (file://) - need to upload to ImgBB
            if (imageUri.startsWith("file://")) {
                console.log(
                    "🔄 Local image detected, uploading to ImgBB for report...",
                );

                const uploadResult =
                    await ImageUploadService.uploadToImgBB(imageUri);

                if (!uploadResult.success || !uploadResult.url) {
                    throw new Error(
                        uploadResult.error || "Failed to upload image",
                    );
                }

                console.log(
                    "✅ Image uploaded successfully:",
                    uploadResult.url,
                );
                setUploadedImageUrl(uploadResult.url);
                setReportModalVisible(true);
            } else {
                // Image already has a URL, use it directly
                console.log("✅ Using existing URL for report:", imageUri);
                setUploadedImageUrl(imageUri);
                setReportModalVisible(true);
            }
        } catch (error) {
            console.error("❌ Error preparing report:", error);
            Alert.alert(
                "Error",
                "Failed to prepare image for reporting. Please try again.",
                [{ text: "OK" }],
            );
        } finally {
            setUploadingForReport(false);
        }
    };

    const handleDeleteVersion = async (versionId: string) => {
        if (chain.versions.length === 1) {
            Alert.alert("Cannot Delete", "You cannot delete the only version");
            return;
        }

        Alert.alert(
            "Delete Version",
            "Are you sure you want to delete this version?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const success =
                            await TransformationService.deleteVersion(
                                chain.id,
                                versionId,
                            );
                        if (success) {
                            const updatedChain =
                                await TransformationService.getChain(chain.id);
                            if (updatedChain) {
                                setChain(updatedChain);
                                setCurrentVersionId(
                                    updatedChain.currentVersionId,
                                );
                            }
                        }
                    },
                },
            ],
        );
    };

    const handleDeleteChain = async () => {
        Alert.alert(
            "Delete Transformation",
            "Are you sure you want to delete this entire transformation chain?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const success = await TransformationService.deleteChain(
                            chain.id,
                        );
                        if (success) {
                            navigation.navigate("MainTabs", {
                                screen: "Profile",
                            });
                        }
                    },
                },
            ],
        );
    };

    const copyToClipboard = async (text: string, type: string) => {
        await Clipboard.setString(text);
        if (isMountedRef.current) {
            setCopiedText(type);
            setTimeout(() => {
                if (isMountedRef.current) {
                    setCopiedText(null);
                }
            }, 2000);
        }
    };

    if (!currentVersion) {
        return (
            <View
                style={[
                    styles.container,
                    { backgroundColor: theme.colors.background },
                ]}
            >
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View
            style={[
                styles.container,
                { backgroundColor: theme.colors.background },
            ]}
        >
            {/* Header */}
            <View
                style={[
                    styles.header,
                    { backgroundColor: theme.colors.headerBackground },
                ]}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <Ionicons
                        name="arrow-back"
                        size={28}
                        color={theme.colors.text}
                    />
                </TouchableOpacity>
                <Text
                    style={[styles.headerTitle, { color: theme.colors.text }]}
                >
                    Version {currentVersion.versionNumber} of{" "}
                    {chain.versions.length}
                </Text>
                <TouchableOpacity
                    onPress={handleDeleteChain}
                    style={styles.deleteButton}
                >
                    <Ionicons
                        name="trash-outline"
                        size={24}
                        color={theme.colors.error}
                    />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                {/* Current Image */}
                <View style={styles.imageContainer}>
                    <OptimizedImage
                        source={{ uri: currentVersion.resultUrl }}
                        style={[styles.mainImage, { width: width - 32 }]}
                        contentFit="contain"
                    />

                    {/* Favorite Badge */}
                    {currentVersion.favorite && (
                        <View
                            style={[
                                styles.favoriteBadge,
                                { backgroundColor: theme.colors.error },
                            ]}
                        >
                            <Ionicons name="heart" size={16} color="#FFFFFF" />
                        </View>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: theme.colors.card },
                        ]}
                        onPress={() => handleToggleFavorite(currentVersion.id)}
                    >
                        <Ionicons
                            name={
                                currentVersion.favorite
                                    ? "heart"
                                    : "heart-outline"
                            }
                            size={24}
                            color={
                                currentVersion.favorite
                                    ? theme.colors.error
                                    : theme.colors.text
                            }
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: theme.colors.card },
                        ]}
                        onPress={handleDownload}
                        disabled={downloading}
                    >
                        {downloading ? (
                            <ActivityIndicator
                                size="small"
                                color={theme.colors.primary}
                            />
                        ) : (
                            <Ionicons
                                name="download-outline"
                                size={24}
                                color={theme.colors.text}
                            />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: theme.colors.card },
                        ]}
                        onPress={handleShare}
                    >
                        <Ionicons
                            name="share-social-outline"
                            size={24}
                            color={theme.colors.text}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: theme.colors.card },
                        ]}
                        onPress={handleReport}
                        disabled={uploadingForReport}
                    >
                        {uploadingForReport ? (
                            <ActivityIndicator
                                size="small"
                                color={theme.colors.primary}
                            />
                        ) : (
                            <Ionicons
                                name="flag-outline"
                                size={24}
                                color={theme.colors.text}
                            />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: theme.colors.card },
                        ]}
                        onPress={() => handleDeleteVersion(currentVersion.id)}
                    >
                        <Ionicons
                            name="trash-outline"
                            size={24}
                            color={theme.colors.error}
                        />
                    </TouchableOpacity>
                </View>

                {/* Version Timeline */}
                <View
                    style={[
                        styles.section,
                        { backgroundColor: theme.colors.card },
                    ]}
                >
                    <Text
                        style={[
                            styles.sectionTitle,
                            { color: theme.colors.text },
                        ]}
                    >
                        Version History ({chain.versions.length})
                    </Text>

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.timeline}
                    >
                        {chain.versions.map((version, _index) => {
                            const isActive = version.id === currentVersionId;
                            return (
                                <TouchableOpacity
                                    key={version.id}
                                    style={[
                                        styles.timelineItem,
                                        isActive && {
                                            borderColor: theme.colors.primary,
                                            borderWidth: 3,
                                        },
                                    ]}
                                    onPress={() =>
                                        handleVersionSelect(version.id)
                                    }
                                >
                                    <OptimizedImage
                                        source={{ uri: version.resultUrl }}
                                        style={styles.timelineImage}
                                        contentFit="fill"
                                    />
                                    <View
                                        style={[
                                            styles.versionBadge,
                                            {
                                                backgroundColor:
                                                    theme.colors.primary,
                                            },
                                        ]}
                                    >
                                        <Text style={styles.versionBadgeText}>
                                            V{version.versionNumber}
                                        </Text>
                                    </View>
                                    {version.favorite && (
                                        <View style={styles.timelineFavorite}>
                                            <Ionicons
                                                name="heart"
                                                size={12}
                                                color={theme.colors.error}
                                            />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Prompt */}
                <View
                    style={[
                        styles.section,
                        { backgroundColor: theme.colors.card },
                    ]}
                >
                    <View style={styles.promptSection}>
                        <Text
                            style={[
                                styles.promptLabel,
                                { color: theme.colors.text },
                            ]}
                        >
                            Prompt
                        </Text>
                        <TouchableOpacity
                            style={styles.copyButton}
                            onPress={() =>
                                copyToClipboard(currentVersion.prompt, "prompt")
                            }
                        >
                            <Ionicons
                                name={
                                    copiedText === "prompt"
                                        ? "checkmark"
                                        : "copy-outline"
                                }
                                size={20}
                                color={theme.colors.primary}
                            />
                            <Text
                                style={[
                                    styles.copyButtonText,
                                    { color: theme.colors.primary },
                                ]}
                            >
                                {copiedText === "prompt" ? "Copied!" : ""}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <Text
                        style={[
                            styles.promptText,
                            { color: theme.colors.text },
                        ]}
                    >
                        {currentVersion.prompt}
                    </Text>
                </View>

                {/* Source Images */}
                <View
                    style={[
                        styles.section,
                        { backgroundColor: theme.colors.card },
                    ]}
                >
                    <Text
                        style={[
                            styles.sectionTitle,
                            { color: theme.colors.text },
                        ]}
                    >
                        Source Images ({chain.sourceImages.length})
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                    >
                        {chain.sourceImages.map((img, index) => (
                            <View
                                key={img.id}
                                style={styles.sourceImageContainer}
                            >
                                <OptimizedImage
                                    source={{ uri: img.thumbnail }}
                                    style={styles.sourceImage}
                                    contentFit="contain"
                                    imageId={img.id}
                                    source_type={img.source}
                                />
                                <View
                                    style={[
                                        styles.sourceBadge,
                                        {
                                            backgroundColor:
                                                theme.colors.textSecondary,
                                        },
                                    ]}
                                >
                                    <Text style={styles.sourceBadgeText}>
                                        {index + 1}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Metadata */}
                <View
                    style={[
                        styles.section,
                        { backgroundColor: theme.colors.card },
                    ]}
                >
                    <Text
                        style={[
                            styles.sectionTitle,
                            { color: theme.colors.text },
                        ]}
                    >
                        Details
                    </Text>
                    <View style={styles.metadata}>
                        <View style={styles.metadataRow}>
                            <Text
                                style={[
                                    styles.metadataLabel,
                                    { color: theme.colors.textSecondary },
                                ]}
                            >
                                Model:
                            </Text>
                            <Text
                                style={[
                                    styles.metadataValue,
                                    { color: theme.colors.text },
                                ]}
                            >
                                {currentVersion.model}
                            </Text>
                        </View>
                        <View style={styles.metadataRow}>
                            <Text
                                style={[
                                    styles.metadataLabel,
                                    { color: theme.colors.textSecondary },
                                ]}
                            >
                                Size:
                            </Text>
                            <Text
                                style={[
                                    styles.metadataValue,
                                    { color: theme.colors.text },
                                ]}
                            >
                                {currentVersion.params.width} x{" "}
                                {currentVersion.params.height}
                            </Text>
                        </View>
                        <View style={styles.metadataRow}>
                            <Text
                                style={[
                                    styles.metadataLabel,
                                    { color: theme.colors.textSecondary },
                                ]}
                            >
                                Created:
                            </Text>
                            <Text
                                style={[
                                    styles.metadataValue,
                                    { color: theme.colors.text },
                                ]}
                            >
                                {new Date(
                                    currentVersion.timestamp,
                                ).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Continue Button */}
            <View
                style={[
                    styles.footer,
                    { backgroundColor: theme.colors.headerBackground },
                ]}
            >
                <TouchableOpacity
                    style={[
                        styles.continueButton,
                        { backgroundColor: theme.colors.primary },
                    ]}
                    onPress={handleContinueTransformation}
                >
                    <Ionicons name="color-wand" size={20} color="#FFFFFF" />
                    <Text style={styles.continueButtonText}>
                        Continue Transforming
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Report Image Modal */}
            {currentVersion && (
                <ReportImageModal
                    visible={reportModalVisible}
                    onClose={() => {
                        setReportModalVisible(false);
                        setUploadedImageUrl(null);
                    }}
                    imageId={currentVersion.id}
                    imageUrl={uploadedImageUrl || currentVersion.resultUrl}
                    source="civitai"
                    prompt={currentVersion.prompt}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 50,
        paddingBottom: 16,
        paddingHorizontal: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "bold",
    },
    deleteButton: {
        padding: 4,
    },
    content: {
        flex: 1,
    },
    imageContainer: {
        alignItems: "center",
        padding: 16,
        position: "relative",
    },
    mainImage: {
        height: 400,
        borderRadius: 12,
    },
    favoriteBadge: {
        position: "absolute",
        top: 24,
        right: 24,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    actionsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    actionButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: "center",
        alignItems: "center",
    },
    section: {
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 12,
    },
    promptText: {
        fontSize: 14,
        lineHeight: 20,
    },
    timeline: {
        flexDirection: "row",
    },
    timelineItem: {
        position: "relative",
        marginRight: 12,
        borderRadius: 8,
        overflow: "hidden",
    },
    timelineImage: {
        width: 100,
        height: 100,
    },
    versionBadge: {
        position: "absolute",
        bottom: 4,
        right: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    versionBadgeText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "bold",
    },
    timelineFavorite: {
        position: "absolute",
        top: 4,
        right: 4,
    },
    sourceImageContainer: {
        position: "relative",
        marginRight: 12,
    },
    sourceImage: {
        width: 120,
        height: 120,
        borderRadius: 8,
    },
    sourceBadge: {
        position: "absolute",
        top: 4,
        left: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    sourceBadgeText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "bold",
    },
    metadata: {
        gap: 8,
    },
    metadataRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    metadataLabel: {
        fontSize: 14,
    },
    metadataValue: {
        fontSize: 14,
        fontWeight: "500",
    },
    footer: {
        padding: 16,
        paddingBottom: 32,
    },
    continueButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        borderRadius: 12,
        gap: 8,
    },
    continueButtonText: {
        color: "#FFFFFF",
        fontSize: 18,
        fontWeight: "bold",
    },
    copyButton: {
        flexDirection: "row",
        alignItems: "center",
        padding: 4,
    },
    promptSection: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    copyButtonText: {
        marginLeft: 4,
        fontSize: 14,
    },
});
