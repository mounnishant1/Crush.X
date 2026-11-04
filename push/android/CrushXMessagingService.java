package in.crushx.notifications;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** A data-only FCM notification; never displays private DM text or trusts a push to authorize navigation. */
public final class CrushXMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "crushx_dm_messages";
    public static final String EXTRA_MESSAGE_ID = "crushx_message_event_id";
    public static final String EXTRA_CONVERSATION_ID = "crushx_conversation_id";
    public static final String EXTRA_RECIPIENT_ID = "crushx_recipient_id";

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        PushAccountState.storeTokenForSync(this, token);
        // Authenticated host client must sync this token on login/resume/rotation.
    }

    @Override public void onMessageReceived(RemoteMessage remote) {
        super.onMessageReceived(remote);
        Map<String, String> data = remote.getData();
        if (!"message".equals(data.get("kind"))) return;
        String eventId = data.get("eventId");
        String conversationId = data.get("conversationId");
        String recipientId = data.get("recipientId");
        if (!PushAccountState.validId(eventId) || !PushAccountState.validId(conversationId) ||
            !PushAccountState.validId(recipientId) ||
            !recipientId.equals(PushAccountState.activeUser(this))) return;
        // In foreground the authenticated WebSocket/UI shows its own in-app popup.
        if (PushForegroundState.isVisible()) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) return;
        launch.setAction("in.crushx.OPEN_MESSAGE_NOTIFICATION");
        launch.putExtra(EXTRA_MESSAGE_ID, eventId);
        launch.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        launch.putExtra(EXTRA_RECIPIENT_ID, recipientId);
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int requestCode = eventId.hashCode() & Integer.MAX_VALUE;
        PendingIntent target = PendingIntent.getActivity(this, requestCode, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        ensureChannel();
        Notification alert = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("Crush.X")
            .setContentText("New message")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true).setContentIntent(target)
            .setGroup("crushx_dm_" + conversationId)
            .build();
        NotificationManagerCompat.from(this).notify(conversationId.hashCode() & Integer.MAX_VALUE, alert);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Messages", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Direct and group messages");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel); // Does not override user's existing channel preferences.
    }
}
