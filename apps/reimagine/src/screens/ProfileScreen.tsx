import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { OptimizedImage } from "../components/OptimizedImage";
import { useTheme } from "../context/ThemeContext";
import type { TabScreenProps } from "../navigation/types";
import { pollinationsService } from "../services/PollinationsService";
import TransformationService from "../services/TransformationService";
import type { TransformationChain } from "../types/transformation";

// TransformationItem component outside to avoid re-creation
interface TransformationItemProps {
    item: TransformationChain;
    imageWidth: number;
    onPress: (chain: TransformationChain) => void;
    onDelete: (chain: TransformationChain) => void;
    theme: any;
}

const TransformationItem = React.memo<TransformationItemProps>(
    ({ item, imageWidth, onPress, onDelete, theme, isDark }) => {
        const currentVersion = item.versions.find(
            (v) => v.id === item.currentVersionId,
        );

        if (!currentVersion) return null;

        return (
            <View
                style={[
                    styles.transformationItem,
                    {
                        width: imageWidth,
                        backgroundColor: theme.colors.surface,
                    },
                ]}
            >
                <TouchableOpacity
                    onPress={() => onPress(item)}
                    style={styles.imageContainer}
                >
                    <OptimizedImage
                        source={{ uri: currentVersion.resultUrl }}
                        style={[
                            styles.transformationImage,
                            { width: imageWidth, height: imageWidth },
                        ]}
                        contentFit="cover"
                        transition={200}
                        imageId={`transformation-${item.id}`}
                        source_type="local"
                    />

                    {/* Version badge */}
                    <View
                        style={[
                            styles.versionBadge,
                            { backgroundColor: theme.colors.primary },
                        ]}
                    >
                        <Text style={styles.versionBadgeText}>
                            V{currentVersion.versionNumber}/
                            {item.versions.length}
                        </Text>
                    </View>

                    {/* Favorite indicator */}
                    {currentVersion.favorite && (
                        <View
                            style={[
                                styles.favoriteBadge,
                                { backgroundColor: theme.colors.error },
                            ]}
                        >
                            <Ionicons name="heart" size={12} color="#FFFFFF" />
                        </View>
                    )}

                    {/* Delete button */}
                    <TouchableOpacity
                        style={[
                            styles.deleteButton,
                            { backgroundColor: `${theme.colors.surface}E6` },
                        ]}
                        onPress={() => onDelete(item)}
                    >
                        <Ionicons
                            name="trash"
                            size={18}
                            color={theme.colors.error}
                        />
                    </TouchableOpacity>
                </TouchableOpacity>

                <View style={styles.transformationInfo}>
                    <Text
                        style={[
                            styles.transformationPrompt,
                            { color: theme.colors.text },
                        ]}
                        numberOfLines={2}
                    >
                        {currentVersion.prompt}
                    </Text>

                    <View style={styles.transformationMetadata}>
                        <Text
                            style={[
                                styles.transformationDate,
                                { color: theme.colors.textSecondary },
                            ]}
                        >
                            {new Date(item.updatedAt).toLocaleDateString()}
                        </Text>
                    </View>

                    <View style={styles.transformationStats}>
                        <View style={styles.statItem}>
                            <Ionicons
                                name="images-outline"
                                size={12}
                                color={theme.colors.textSecondary}
                            />
                            <Text
                                style={[
                                    styles.statText,
                                    { color: theme.colors.textSecondary },
                                ]}
                            >
                                {item.sourceImages.length} source
                            </Text>
                        </View>
                        <View style={styles.statItem}>
                            <Ionicons
                                name="color-wand-outline"
                                size={12}
                                color={theme.colors.textSecondary}
                            />
                            <Text
                                style={[
                                    styles.statText,
                                    { color: theme.colors.textSecondary },
                                ]}
                            >
                                {currentVersion.model}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    },
    (prevProps, nextProps) => {
        return (
            prevProps.item.id === nextProps.item.id &&
            prevProps.item.currentVersionId ===
                nextProps.item.currentVersionId &&
            prevProps.imageWidth === nextProps.imageWidth &&
            prevProps.isDark === nextProps.isDark
        );
    },
);

TransformationItem.displayName = "TransformationItem";

export default function ProfileScreen({
    navigation,
}: TabScreenProps<"Profile">) {
    const { theme, isDark, toggleTheme } = useTheme();
    const [transformations, setTransformations] = useState<
        TransformationChain[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [remainingTransformations, setRemainingTransformations] = useState(0);
    const { width } = useWindowDimensions();
    const imageWidth = (width - 20) / 2;

    useFocusEffect(
        React.useCallback(() => {
            console.log("ProfileScreen: Focus effect triggered");
            loadData();
        }, [loadData]),
    );

    const loadData = async () => {
        try {
            setLoading(true);

            const [chains, remaining] = await Promise.all([
                TransformationService.getAllChains(),
                pollinationsService.getRemainingGenerations(),
            ]);

            console.log("ProfileScreen: Data loaded", {
                transformations: chains.length,
                remaining,
            });

            setTransformations(chains);
            setRemainingTransformations(remaining);
        } catch (error) {
            console.error("Error loading data:", error);
            Alert.alert("Error", "Failed to load transformation history");
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleChainPress = useCallback(
        (chain: TransformationChain) => {
            navigation.navigate("TransformationDetail", { chain });
        },
        [navigation],
    );

    const handleDeleteChain = useCallback(
        async (chain: TransformationChain) => {
            Alert.alert(
                "Delete Transformation",
                "Are you sure you want to delete this transformation chain?",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                            const success =
                                await TransformationService.deleteChain(
                                    chain.id,
                                );
                            if (success) {
                                setTransformations((prev) =>
                                    prev.filter((c) => c.id !== chain.id),
                                );
                            }
                        },
                    },
                ],
            );
        },
        [],
    );

    const handleClearAllTransformations = useCallback(() => {
        if (transformations.length === 0) return;

        Alert.alert(
            "Clear All Transformations",
            "Are you sure you want to delete all transformations? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear All",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            // Delete all chains
                            for (const chain of transformations) {
                                await TransformationService.deleteChain(
                                    chain.id,
                                );
                            }
                            setTransformations([]);
                        } catch (error) {
                            console.error(
                                "Error clearing transformations:",
                                error,
                            );
                            Alert.alert(
                                "Error",
                                "Failed to clear transformations",
                            );
                        }
                    },
                },
            ],
        );
    }, [transformations]);

    const renderTransformationItem = useCallback(
        ({ item }: { item: TransformationChain }) => {
            return (
                <TransformationItem
                    item={item}
                    imageWidth={imageWidth}
                    onPress={handleChainPress}
                    onDelete={handleDeleteChain}
                    theme={theme}
                    isDark={isDark}
                />
            );
        },
        [imageWidth, handleChainPress, handleDeleteChain, theme, isDark],
    );

    const EmptyComponent = useMemo(
        () => (
            <View style={styles.emptyContainer}>
                <Ionicons
                    name="color-wand-outline"
                    size={64}
                    color={theme.colors.textTertiary}
                />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                    No Transformations Yet
                </Text>
                <Text
                    style={[
                        styles.emptyDescription,
                        { color: theme.colors.textSecondary },
                    ]}
                >
                    Start by selecting images from the Browse tab and transform
                    them with AI
                </Text>
                <TouchableOpacity
                    style={[
                        styles.browseButton,
                        { backgroundColor: theme.colors.primary },
                    ]}
                    onPress={() => navigation.navigate("Home")}
                >
                    <Ionicons name="images" size={20} color="#FFFFFF" />
                    <Text style={styles.browseButtonText}>Browse Images</Text>
                </TouchableOpacity>
            </View>
        ),
        [theme, navigation],
    );

    const ListHeaderComponent = useMemo(
        () => (
            <View style={styles.listHeader}>
                <View style={styles.listHeaderTop}>
                    <Text
                        style={[styles.listTitle, { color: theme.colors.text }]}
                    >
                        Transformation History
                    </Text>
                    {transformations.length > 0 && (
                        <TouchableOpacity
                            onPress={handleClearAllTransformations}
                            style={styles.clearAllButton}
                        >
                            <Text
                                style={[
                                    styles.clearAllText,
                                    { color: theme.colors.error },
                                ]}
                            >
                                Clear All
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {transformations.length > 0 && (
                    <Text
                        style={[
                            styles.transformationsCount,
                            { color: theme.colors.textSecondary },
                        ]}
                    >
                        {transformations.length} transformation
                        {transformations.length !== 1 ? "s" : ""}
                    </Text>
                )}
            </View>
        ),
        [theme, transformations.length, handleClearAllTransformations],
    );

    const keyExtractor = useCallback(
        (item: TransformationChain) => item.id,
        [],
    );

    const getItemType = useCallback(() => "transformation", []);

    if (loading) {
        return (
            <View
                style={[
                    styles.container,
                    styles.centerContainer,
                    { backgroundColor: theme.colors.background },
                ]}
            >
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text
                    style={[
                        styles.loadingText,
                        { color: theme.colors.textSecondary },
                    ]}
                >
                    Loading history...
                </Text>
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
                <View style={styles.headerContent}>
                    <View>
                        <Text
                            style={[styles.title, { color: theme.colors.text }]}
                        >
                            ReImagine
                        </Text>
                        <Text
                            style={[
                                styles.subtitle,
                                { color: theme.colors.textSecondary },
                            ]}
                        >
                            Transform with AI
                        </Text>
                    </View>

                    <View style={styles.headerActions}>
                        <View style={styles.creditsContainer}>
                            <Ionicons
                                name="flash"
                                size={16}
                                color={theme.colors.primary}
                            />
                            <Text
                                style={[
                                    styles.creditsText,
                                    { color: theme.colors.text },
                                ]}
                            >
                                {remainingTransformations}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.themeToggle,
                                {
                                    backgroundColor: theme.colors.card,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                            onPress={toggleTheme}
                        >
                            <Ionicons
                                name={isDark ? "sunny-outline" : "moon-outline"}
                                size={20}
                                color={theme.colors.text}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Transformations List */}
            <FlashList
                data={transformations}
                renderItem={renderTransformationItem}
                numColumns={2}
                estimatedItemSize={imageWidth + 140}
                ListHeaderComponent={ListHeaderComponent}
                ListEmptyComponent={EmptyComponent}
                extraData={theme.colors.surface}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[theme.colors.primary]}
                        tintColor={theme.colors.primary}
                    />
                }
                contentContainerStyle={styles.listContent}
                keyExtractor={keyExtractor}
                getItemType={getItemType}
                drawDistance={500}
                removeClippedSubviews={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centerContainer: {
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    headerContent: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
    },
    subtitle: {
        fontSize: 14,
        marginTop: 2,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    creditsContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.1)",
    },
    creditsText: {
        fontSize: 16,
        fontWeight: "bold",
    },
    themeToggle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
    },
    listContent: {
        paddingHorizontal: 4,
    },
    listHeader: {
        paddingHorizontal: 12,
        paddingTop: 16,
        paddingBottom: 12,
    },
    listHeaderTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    listTitle: {
        fontSize: 20,
        fontWeight: "600",
    },
    clearAllButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    clearAllText: {
        fontSize: 16,
        fontWeight: "500",
    },
    transformationsCount: {
        fontSize: 14,
    },
    transformationItem: {
        borderRadius: 12,
        marginBottom: 16,
        margin: 4,
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    imageContainer: {
        position: "relative",
    },
    transformationImage: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    versionBadge: {
        position: "absolute",
        top: 8,
        left: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    versionBadgeText: {
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: "bold",
    },
    favoriteBadge: {
        position: "absolute",
        top: 8,
        right: 48,
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    deleteButton: {
        position: "absolute",
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    transformationInfo: {
        padding: 12,
    },
    transformationPrompt: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 6,
    },
    transformationMetadata: {
        marginBottom: 6,
    },
    transformationDate: {
        fontSize: 12,
    },
    transformationStats: {
        flexDirection: "row",
        gap: 12,
    },
    statItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    statText: {
        fontSize: 11,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 32,
        marginTop: 100,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "600",
        marginTop: 16,
        marginBottom: 8,
    },
    emptyDescription: {
        fontSize: 16,
        textAlign: "center",
        lineHeight: 22,
        marginBottom: 24,
    },
    browseButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 24,
        gap: 8,
    },
    browseButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "bold",
    },
});
