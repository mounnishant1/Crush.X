package in.crushx.notifications;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.core.app.NotificationManagerCompat;

/** Persist only the currently authenticated account ID and token sync hint. */
public final class PushAccountState {
    private static final String PREFS = "crushx_push_native";
    private static final String ACCOUNT = "active_user_id";
    private static final String PENDING_TOKEN = "latest_fcm_token";
    private PushAccountState() {}

    public static void setActiveUser(Context context, String userId) {
        if (!validId(userId)) throw new IllegalArgumentException("Invalid verified account ID");
        // Called only after host has verified its authenticated session.
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(ACCOUNT, userId).commit();
    }

    public static void clearActiveUser(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        preferences.edit().remove(ACCOUNT).commit();
        NotificationManagerCompat.from(context).cancelAll();
        // Host must also revoke device token association on backend.
    }

    public static String activeUser(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACCOUNT, "");
    }

    public static void storeTokenForSync(Context context, String token) {
        if (token == null || token.length() > 4096) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PENDING_TOKEN, token).apply();
    }

    public static String latestToken(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PENDING_TOKEN, "");
    }

    public static boolean validId(String value) {
        return value != null && value.matches("[A-Za-z0-9_.:-]{1,128}");
    }
}
