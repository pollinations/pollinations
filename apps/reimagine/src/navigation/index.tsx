import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import EditScreen from "../screens/EditScreen";
import TransformationDetailScreen from "../screens/TransformationDetailScreen";
import TabNavigator from "./TabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    animation: "none",
                    animationDuration: 0,
                    gestureEnabled: true,
                    presentation: "card",
                }}
            >
                {/* Main Tabs */}
                <Stack.Screen
                    name="MainTabs"
                    component={TabNavigator}
                    options={{
                        headerShown: false,
                        animation: "none",
                        animationDuration: 0,
                    }}
                />

                {/* Edit Screen (Transformation) */}
                <Stack.Screen
                    name="EditScreen"
                    component={EditScreen}
                    options={{
                        headerShown: false,
                        animation: "slide_from_bottom",
                        presentation: "modal",
                    }}
                />

                {/* Transformation Detail (historique versions) */}
                <Stack.Screen
                    name="TransformationDetail"
                    component={TransformationDetailScreen}
                    options={{
                        headerShown: false,
                        animation: "none",
                        animationDuration: 0,
                        presentation: "card",
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
