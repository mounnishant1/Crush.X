using System;
using System.Linq;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensMiniGameTests
    {
        [Test]
        public void Catalog_HasFourteenLensGamesAndSevenPuzzlesWithUniqueIds()
        {
            Assert.AreEqual(21, LensMiniGameCore.Catalog.Count);
            Assert.AreEqual(14, LensMiniGameCore.Catalog.Count(x => x.Family == MiniGameFamily.Lens));
            Assert.AreEqual(7, LensMiniGameCore.Catalog.Count(x => x.Family == MiniGameFamily.Puzzle));
            Assert.AreEqual(21, LensMiniGameCore.Catalog.Select(x => x.Id).Distinct().Count());
            foreach (MiniGameDefinition entry in LensMiniGameCore.Catalog)
                Assert.Greater(entry.Seconds, 0);
        }

        [Test]
        public void AllGames_StartAndReturnWithoutExternalDependencies()
        {
            var game = new LensMiniGameCore(3);
            foreach (MiniGameDefinition entry in LensMiniGameCore.Catalog)
            {
                game.Start(entry.Id, 20);
                Assert.AreEqual(entry.Id, game.Game);
                Assert.AreEqual(MiniGamePhase.Playing, game.Phase);
                Assert.AreEqual(entry.Seconds, game.SecondsLeft(20));
                game.ReturnToCatalog();
                Assert.AreEqual(MiniGamePhase.Catalog, game.Phase);
            }
        }

#if UNITY_2019_4_OR_NEWER
        [Test]
        public void GamesOverlay_BackFirstReturnsToCatalogThenCamera()
        {
            var panel = new LensMiniGamePanel();
            panel.OpenPanel();
            Assert.IsTrue(panel.IsOpen);
            panel.Game.Start(MiniGameId.MemoryPairs, 0);
            Assert.IsTrue(panel.Back());
            Assert.AreEqual(MiniGamePhase.Catalog, panel.Game.Phase);
            Assert.IsTrue(panel.IsOpen);
            Assert.IsTrue(panel.Back());
            Assert.IsFalse(panel.IsOpen);
            Assert.IsFalse(panel.Back());
        }

#endif
        [Test]
        public void MemoryMismatch_IsTemporarilyVisibleThenFlipsBack()
        {
            var game = new LensMiniGameCore(15);
            game.Start(MiniGameId.MemoryPairs, 0);
            int[] cards = game.Board;
            int first = 0, other = Array.FindIndex(cards, value => value != cards[first]);
            Assert.IsTrue(game.TapCell(first, 1));
            Assert.IsTrue(game.TapCell(other, 1));
            Assert.IsTrue(game.IsMemoryVisible(first));
            Assert.IsFalse(game.TapCell(2, 1.2));
            game.Tick(2);
            Assert.IsFalse(game.IsMemoryVisible(first));
            Assert.IsFalse(game.IsMemoryVisible(other));
            Assert.AreEqual(1, game.Mistakes);
        }

        [Test]
        public void FaceInput_RejectsStaleRepeatedAndMissingTrackingSamples()
        {
            var game = new LensMiniGameCore(13);
            game.Start(MiniGameId.SmileRush, 1);
            var smile = new FaceExpressionSample
            {
                Available = FaceExpressionChannels.SmileLeft | FaceExpressionChannels.SmileRight,
                Timestamp = 2,
                SmileLeft = .9f, SmileRight = .9f
            };
            game.ObserveFace(smile, false, 2);
            Assert.AreEqual(0, game.Progress);
            game.ObserveFace(smile, true, 2);
            Assert.AreEqual(1, game.Progress);
            game.ObserveFace(smile, true, 2);
            Assert.AreEqual(1, game.Progress);
            smile.Timestamp = 2.2; smile.SmileLeft = .1f; smile.SmileRight = .1f;
            game.ObserveFace(smile, true, 2.2);
            smile.Timestamp = 2.3; smile.SmileLeft = .95f; smile.SmileRight = .95f;
            game.ObserveFace(smile, true, 2.3);
            Assert.AreEqual(2, game.Progress);
            smile.Timestamp = 2.4;
            game.ObserveFace(smile, true, 10);
            Assert.AreEqual(2, game.Progress);
        }

        [Test]
        public void FaceGame_TouchFallbackIsAccessibleAndCompletes()
        {
            var game = new LensMiniGameCore(10);
            game.Start(MiniGameId.BlinkCatch, 0);
            for (int i = 0; i < 10; i++) Assert.IsTrue(game.TapFallback(i + 1));
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
            Assert.AreEqual(100, game.Score);
            Assert.IsFalse(game.TapFallback(11));
        }

        [Test]
        public void TimedChallenge_PauseFreezesCountdownAndResumeShiftsDeadline()
        {
            var game = new LensMiniGameCore(9);
            game.Start(MiniGameId.TargetTap, 5);
            game.Pause(8);
            Assert.IsTrue(game.Paused);
            game.Tick(500);
            Assert.AreEqual(MiniGamePhase.Playing, game.Phase);
            Assert.AreEqual(32, game.SecondsLeft(500));
            game.Resume(500);
            game.Tick(501);
            Assert.AreEqual(MiniGamePhase.Playing, game.Phase);
            game.Tick(533);
            Assert.AreEqual(MiniGamePhase.TimeUp, game.Phase);
        }

        [Test]
        public void TargetAndOddColor_OnlyAwardCorrectTaps()
        {
            var game = new LensMiniGameCore(4);
            foreach (MiniGameId kind in new[] { MiniGameId.TargetTap, MiniGameId.OddColor })
            {
                game.Start(kind, 0);
                int incorrect = (game.Target + 1) % 9;
                Assert.IsFalse(game.TapCell(incorrect, .1));
                Assert.AreEqual(0, game.Score);
                int needed = kind == MiniGameId.TargetTap ? 10 : 8;
                for (int i = 0; i < needed; i++)
                    Assert.IsTrue(game.TapCell(game.Target, i + 1));
                Assert.AreEqual(MiniGamePhase.Won, game.Phase);
            }
        }

        [Test]
        public void SlidingTileScramble_IsUnsolvedAndSolvable()
        {
            var game = new LensMiniGameCore(7);
            game.Start(MiniGameId.SlidingTiles, 0);
            var tiles = game.Board.Take(9).ToArray();
            CollectionAssert.AreEquivalent(Enumerable.Range(0, 9).ToArray(), tiles);
            Assert.IsFalse(tiles.Take(8).SequenceEqual(Enumerable.Range(1, 8)) && tiles[8] == 0);
            int inversions = 0;
            for (int i = 0; i < 9; i++) for (int j = i + 1; j < 9; j++)
                if (tiles[i] != 0 && tiles[j] != 0 && tiles[i] > tiles[j]) inversions++;
            Assert.AreEqual(0, inversions % 2);
        }

        [Test]
        public void MemoryPairs_MatchesEightPairsAndRejectsDuplicateCard()
        {
            var game = new LensMiniGameCore(8);
            game.Start(MiniGameId.MemoryPairs, 0);
            int[] cards = game.Board;
            foreach (var group in Enumerable.Range(0, 16).GroupBy(i => cards[i]))
            {
                int[] pair = group.ToArray();
                Assert.AreEqual(2, pair.Length);
                Assert.IsTrue(game.TapCell(pair[0], 1));
                Assert.IsFalse(game.TapCell(pair[0], 1));
                Assert.IsTrue(game.TapCell(pair[1], 1));
                Assert.IsTrue(game.IsMatched(pair[0]));
            }
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
            Assert.AreEqual(160, game.Score);
        }

        [Test]
        public void Sequence_RequiresMemorizePhaseThenCorrectOrder()
        {
            var game = new LensMiniGameCore(8);
            game.Start(MiniGameId.SequenceRecall, 0);
            Assert.IsFalse(game.TapCell(game.Sequence[0], 1));
            for (int round = 0; round < 5; round++)
            {
                double time = 6 + 5 * round;
                for (int step = 0; step < game.SequenceLength; step++)
                    Assert.IsTrue(game.TapCell(game.Sequence[step], time));
            }
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
        }

        [Test]
        public void MathAnswers_AreUniqueAndWinnable()
        {
            var game = new LensMiniGameCore(9);
            game.Start(MiniGameId.QuickMath, 0);
            for (int round = 0; round < 8; round++)
            {
                string[] p = game.Prompt.Split(' ');
                int a = int.Parse(p[0]), b = int.Parse(p[2]);
                int expected = p[1] == "+" ? a + b : a - b;
                int[] options = game.Choices;
                Assert.AreEqual(4, options.Distinct().Count());
                int slot = Array.IndexOf(options, expected);
                Assert.GreaterOrEqual(slot, 0);
                Assert.IsTrue(game.TapCell(slot, round + 1));
            }
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
        }

        [Test]
        public void Scramble_OnlyCorrectAnagramAdvances()
        {
            var game = new LensMiniGameCore(2);
            game.Start(MiniGameId.WordScramble, 0);
            for (int round = 0; round < 8; round++)
            {
                string sorted = new string(game.ScrambledWord.OrderBy(x => x).ToArray());
                int match = -1;
                for (int i = 0; i < 4; i++)
                    if (new string(game.ChoiceText(i).OrderBy(x => x).ToArray()) == sorted) match = i;
                Assert.GreaterOrEqual(match, 0);
                Assert.IsTrue(game.TapCell(match, round + 1));
            }
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
        }

        [Test]
        public void Maze_RejectsWallsAndNonAdjacentMoves()
        {
            var game = new LensMiniGameCore(1);
            game.Start(MiniGameId.MazeEscape, 0);
            Assert.IsFalse(game.TapCell(24, 1));
            Assert.IsFalse(game.TapCell(6, 1));
            foreach (int step in new[] { 1, 2, 3, 4, 9, 14, 19, 24 })
                Assert.IsTrue(game.TapCell(step, 1));
            Assert.AreEqual(MiniGamePhase.Won, game.Phase);
        }
    }
}
