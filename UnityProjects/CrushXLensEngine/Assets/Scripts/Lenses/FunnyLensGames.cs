using UnityEngine;

namespace CrushX.LensEngine
{
    public enum FunnyGameKind { BlinkPop, MouthCatch }

    public interface IFunnyLensGame
    {
        int Score { get; }
        int Attempts { get; }
        float RemainingSeconds { get; }
    }

    /// <summary>
    /// Event-driven mini-game score logic. A single blink / mouth opening can
    /// score once. Stale tracking cannot increment it or consume the timer.
    /// No network, tokens, wallet, or cash prizes.
    /// </summary>
    public sealed class FunnyGameState
    {
        public int Score { get; private set; }
        public int Attempts { get; private set; }
        public float RemainingSeconds { get; private set; } = 30f;
        public bool Running { get { return RemainingSeconds > 0f; } }
        private bool previouslyActive;
        private float lastTriggerTime = -100f;
        private float previousTime = -1f;

        public void Reset(float now)
        {
            Score = 0;
            Attempts = 0;
            RemainingSeconds = 30f;
            previouslyActive = false;
            lastTriggerTime = -100f;
            previousTime = now;
        }

        public bool Step(FunnyGameKind kind, FaceSample frame, float now)
        {
            if (previousTime < 0f) previousTime = now;
            float delta = Mathf.Clamp(now - previousTime, 0f, .1f);
            previousTime = now;
            if (!frame.Valid || frame.Confidence < .6f)
            {
                previouslyActive = false;
                return false;
            }

            if (!Running) return false;
            RemainingSeconds = Mathf.Max(0f, RemainingSeconds - delta);
            bool pressed = kind == FunnyGameKind.BlinkPop ?
                frame.Blink >= .72f : frame.MouthOpen >= .62f;
            bool newTrigger = pressed && !previouslyActive;
            previouslyActive = pressed;
            if (!newTrigger || now - lastTriggerTime < .30f || !Running)
                return false;
            lastTriggerTime = now;
            Score += kind == FunnyGameKind.BlinkPop ? 10 : 5;
            Attempts++;
            return true;
        }
    }

    public abstract class FunnyLensGameEffect : LensEffect, IFunnyLensGame
    {
        protected readonly FunnyGameState game = new FunnyGameState();
        private Transform target;
        private float lastPopAt = -100f;
        protected abstract FunnyGameKind Kind { get; }
        public int Score => game.Score;
        public int Attempts => game.Attempts;
        public float RemainingSeconds => game.RemainingSeconds;

        public override void Build()
        {
            game.Reset(Time.unscaledTime);
            target = new GameObject("FunnyGameTarget").transform;
            target.SetParent(transform, false);
            target.localPosition = new Vector3(0, .42f, -.14f);
            var color = Kind == FunnyGameKind.BlinkPop ?
                new Color(.18f, .94f, .88f) : new Color(.97f, .54f, .12f);
            LensGeometry.Add(target, "TargetBall", PrimitiveType.Sphere,
                Vector3.zero, new Vector3(.14f, .14f, .10f), color);
            LensGeometry.Ring(target, "TargetHalo", Vector3.zero, .14f,
                .014f, Color.white);
        }

        public override void Animate(FaceSample face, float t)
        {
            if (target == null) return;
            bool success = game.Step(Kind, face, Time.unscaledTime);
            if (success) lastPopAt = Time.unscaledTime;
            float popScale = Time.unscaledTime - lastPopAt < .20f ? 1.6f : 1f;
            target.localScale = Vector3.one * popScale *
                (1f + Mathf.Sin(t * 4f) * .07f);
            target.localPosition = new Vector3(
                Mathf.Sin(t * .65f) * .21f,
                .43f + Mathf.Cos(t * 1.2f) * .075f, -.14f);
        }
    }

    public sealed class BlinkPopFunnyLens : FunnyLensGameEffect
    {
        public override string LensId { get { return "funny-game-blinkpop"; } }
        protected override FunnyGameKind Kind => FunnyGameKind.BlinkPop;
    }

    public sealed class MouthCatchFunnyLens : FunnyLensGameEffect
    {
        public override string LensId { get { return "funny-game-mouthcatch"; } }
        protected override FunnyGameKind Kind => FunnyGameKind.MouthCatch;
    }
}
