using System;

namespace CrushX.LensEngine
{
    /// <summary>Frame-rate independent carousel motion, measured in thumbnail spacings.</summary>
    public sealed class LensCarouselMotion
    {
        private const double SpringRate = 20.0;
        private double velocity;
        private double dragOrigin;

        public int Count { get; private set; }
        public double Position { get; private set; }
        public double Target { get; private set; }
        public bool IsDragging { get; private set; }
        // Small result sets stay unique and stop at their edges instead of repeating thumbnails.
        public bool Loops { get { return Count >= 5; } }
        public bool IsSettled { get { return !IsDragging && Math.Abs(Position - Target) < .001 && Math.Abs(velocity) < .01; } }

        public void Reset(int count, int selectedIndex)
        {
            Count = Math.Max(0, count);
            Position = Target = Count == 0 ? 0 : Math.Max(0, Math.Min(Count - 1, selectedIndex));
            velocity = 0;
            IsDragging = false;
        }

        public void BeginDrag()
        {
            if (Count == 0) return;
            dragOrigin = Position;
            velocity = 0;
            IsDragging = true;
        }

        public void Drag(double deltaInCells)
        {
            if (!IsDragging || double.IsNaN(deltaInCells) || double.IsInfinity(deltaInCells)) return;
            if (Count <= 1) { Position = 0; return; }
            double position = dragOrigin - deltaInCells;
            if (!Loops)
            {
                // A little edge resistance communicates that there are no more unique results.
                if (position < 0) position = -Math.Min(.3, -position * .2);
                if (position > Count - 1) position = Count - 1 + Math.Min(.3, (position - Count + 1) * .2);
            }
            Position = position;
        }

        /// <summary>Returns one selection on release, and never while dragging or after a second release.</summary>
        public int EndDrag(double releaseVelocityCellsPerSecond = 0)
        {
            if (!IsDragging) return -1;
            IsDragging = false;
            // Project a small amount of momentum in the finger's direction. Keep flicks
            // bounded so even a very fast gesture cannot skip an entire lens catalog.
            if (double.IsNaN(releaseVelocityCellsPerSecond) || double.IsInfinity(releaseVelocityCellsPerSecond))
                releaseVelocityCellsPerSecond = 0;
            double projected = Math.Max(-2.2, Math.Min(2.2, releaseVelocityCellsPerSecond * .14));
            Target = Math.Floor(Position + projected + .5);
            if (!Loops) Target = Math.Max(0, Math.Min(Count - 1, Target));
            velocity = 0;
            return WrappedIndex(Target, Count);
        }

        public void CancelDrag()
        {
            if (!IsDragging) return;
            IsDragging = false;
            velocity = 0;
        }

        public void SelectIndex(int index, int direction = 0)
        {
            if (index < 0 || index >= Count) return;
            IsDragging = false;
            if (!Loops) { Target = index; return; }
            double reference = direction == 0 ? Position : Target;
            double target = index + Math.Round((reference - index) / Count) * Count;
            if (direction > 0 && target < reference) target += Count;
            if (direction < 0 && target > reference) target -= Count;
            Target = target;
        }

        public void Tick(double unscaledDeltaSeconds)
        {
            if (IsDragging || unscaledDeltaSeconds <= 0 || double.IsNaN(unscaledDeltaSeconds) ||
                double.IsInfinity(unscaledDeltaSeconds)) return;
            // Exact critically damped spring: the same elapsed time gives the same result at any frame rate.
            double offset = Position - Target;
            double coefficient = velocity + SpringRate * offset;
            double decay = Math.Exp(-SpringRate * unscaledDeltaSeconds);
            Position = Target + (offset + coefficient * unscaledDeltaSeconds) * decay;
            velocity = (velocity - SpringRate * coefficient * unscaledDeltaSeconds) * decay;
            if (!IsSettled) return;
            Position = Target;
            velocity = 0;
            // Rebase only whole turns, so the wrapped images retain exactly the same screen positions.
            if (Loops)
            {
                Position = Target = WrappedIndex(Target, Count);
            }
        }

        public static int WrappedIndex(double position, int count)
        {
            if (count <= 0) return -1;
            double index = position % count;
            return (int)(index < 0 ? index + count : index);
        }
    }
}
