package in.crushx.notifications;

/** Host Activity calls setVisible(true) in onResume and false in onPause. */
public final class PushForegroundState {
    private static volatile boolean visible;
    private PushForegroundState() {}
    public static void setVisible(boolean state) { visible = state; }
    public static boolean isVisible() { return visible; }
}
