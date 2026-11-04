using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class FaceExpressionsHostTests
    {
        [Test]
        public void ModelCoefficientsMapToGenuineAvailableSignals()
        {
            var model = new Dictionary<string, float>
            {
                ["jawOpen"] = .7f, ["eyeBlinkLeft"] = .8f, ["eyeBlinkRight"] = .6f,
                ["mouthSmileLeft"] = .2f, ["mouthSmileRight"] = .6f,
                ["browInnerUp"] = .3f, ["browOuterUpLeft"] = .8f, ["browOuterUpRight"] = .1f
            };
            Assert.IsTrue(BlendshapeExpressionMapper.TryMap(model, 5, out FaceExpressionSample sample));
            Assert.AreEqual(5, sample.Timestamp);
            Assert.IsTrue(sample.TryGet(ExpressionSignal.MouthOpen, out float mouth));
            Assert.AreEqual(.7f, mouth);
            Assert.IsTrue(sample.TryGet(ExpressionSignal.Blink, out float blink));
            Assert.AreEqual(.6f, blink);
            Assert.IsTrue(sample.TryGet(ExpressionSignal.Smile, out float smile));
            Assert.AreEqual(.4f, smile, 1e-6);
            Assert.IsTrue(sample.TryGet(ExpressionSignal.BrowRaise, out float brow));
            Assert.AreEqual(.55f, brow, 1e-6);
            Assert.IsFalse(sample.TryGet(ExpressionSignal.GazeLeftX, out _));
        }

        [Test]
        public void PartialModelDoesNotInventExpressionsOrTurnWinkIntoBilateralBlink()
        {
            Assert.IsTrue(BlendshapeExpressionMapper.TryMap(new Dictionary<string, float> { ["eyeBlinkLeft"] = 1 }, 1, out FaceExpressionSample sample));
            Assert.IsTrue(sample.TryGet(ExpressionSignal.BlinkLeft, out _));
            Assert.IsFalse(sample.TryGet(ExpressionSignal.Blink, out _));
            Assert.IsFalse(sample.TryGet(ExpressionSignal.MouthOpen, out _));
            Assert.IsFalse(BlendshapeExpressionMapper.TryMap(new Dictionary<string, float>(), 1, out _));
            Assert.IsFalse(BlendshapeExpressionMapper.TryMap(null, 1, out _));
        }

        [Test]
        public void CorruptModelCoefficientsDoNotBecomeSupportedChannels()
        {
            foreach (float invalid in new[] { float.NaN, float.PositiveInfinity, -1f, 1.01f })
            {
                Assert.IsFalse(BlendshapeExpressionMapper.TryMap(new Dictionary<string, float> { ["jawOpen"] = invalid }, 1, out FaceExpressionSample sample));
                Assert.AreEqual(FaceExpressionChannels.None, sample.Available);
            }
            Assert.IsFalse(BlendshapeExpressionMapper.TryMap(new Dictionary<string, float> { ["jawOpen"] = .5f }, double.NaN, out _));
            Assert.IsFalse(BlendshapeExpressionMapper.TryMap(new Dictionary<string, float> { ["jawOpen"] = .5f }, -1, out _));
        }

        [Test]
        public void CombinedSignalsValidateBothConstituents()
        {
            var sample = new FaceExpressionSample
            {
                Available = FaceExpressionChannels.BlinkLeft | FaceExpressionChannels.BlinkRight |
                    FaceExpressionChannels.SmileLeft | FaceExpressionChannels.SmileRight |
                    FaceExpressionChannels.BrowRaiseLeft | FaceExpressionChannels.BrowRaiseRight,
                BlinkLeft = 2, BlinkRight = .5f,
                SmileLeft = -.5f, SmileRight = .5f,
                BrowRaiseLeft = 2, BrowRaiseRight = 0
            };
            Assert.IsFalse(sample.TryGet(ExpressionSignal.Blink, out _));
            Assert.IsFalse(sample.TryGet(ExpressionSignal.Smile, out _));
            Assert.IsFalse(sample.TryGet(ExpressionSignal.BrowRaise, out _));
        }

        [Test]
        public void GazeUsesSignedCommonAxisAndRequiresFourCoefficientsPerEye()
        {
            var model = new Dictionary<string, float>
            {
                ["eyeLookOutLeft"] = .8f, ["eyeLookInLeft"] = .2f,
                ["eyeLookUpLeft"] = .9f, ["eyeLookDownLeft"] = .1f,
                ["eyeLookOutRight"] = .8f, ["eyeLookInRight"] = .2f,
                ["eyeLookUpRight"] = .1f, ["eyeLookDownRight"] = .9f
            };
            Assert.IsTrue(BlendshapeExpressionMapper.TryMap(model, 1, out FaceExpressionSample sample));
            Assert.IsTrue(sample.TryGet(ExpressionSignal.GazeLeftX, out float leftX));
            Assert.IsTrue(sample.TryGet(ExpressionSignal.GazeRightX, out float rightX));
            Assert.AreEqual(.6f, leftX, 1e-6);
            Assert.AreEqual(-.6f, rightX, 1e-6);
            Assert.IsTrue(sample.TryGet(ExpressionSignal.GazeRightY, out float rightY));
            Assert.AreEqual(-.8f, rightY, 1e-6);
            model.Remove("eyeLookDownRight");
            BlendshapeExpressionMapper.TryMap(model, 1, out sample);
            Assert.IsFalse(sample.TryGet(ExpressionSignal.GazeRightX, out _));
            Assert.IsTrue(sample.TryGet(ExpressionSignal.GazeLeftX, out _));
        }

        [Test]
        public void SmoothingDoesNotPreserveUnavailableChannelsOrBlendNewChannelsFromZero()
        {
            var previous = new FaceExpressionSample
            { Available = FaceExpressionChannels.MouthOpen, MouthOpen = .8f, Timestamp = 1 };
            var incoming = new FaceExpressionSample
            { Available = FaceExpressionChannels.BlinkLeft, BlinkLeft = .6f, Timestamp = 2 };
            FaceExpressionSample result = FaceExpressionSample.Smooth(previous, incoming, .5f);
            Assert.IsFalse(result.TryGet(ExpressionSignal.MouthOpen, out _));
            Assert.IsTrue(result.TryGet(ExpressionSignal.BlinkLeft, out float blink));
            Assert.AreEqual(.6f, blink);
            incoming = new FaceExpressionSample
            { Available = FaceExpressionChannels.MouthOpen, MouthOpen = .2f, Timestamp = 3 };
            result = FaceExpressionSample.Smooth(previous, incoming, .5f);
            Assert.IsTrue(result.TryGet(ExpressionSignal.MouthOpen, out float mouth));
            Assert.AreEqual(.5f, mouth, 1e-6);
            Assert.AreEqual(3, result.Timestamp);
        }

        [Test]
        public void SanitizationAndSmoothingNeverPromoteMalformedChannelsToValidZero()
        {
            var malformed = new FaceExpressionSample
            { Available = FaceExpressionChannels.MouthOpen | FaceExpressionChannels.GazeLeft, MouthOpen = float.NaN, GazeLeftX = .5f, GazeLeftY = 2 };
            Assert.AreEqual(FaceExpressionChannels.None, malformed.Sanitized().Available);
            FaceExpressionSample smoothed = FaceExpressionSample.Smooth(default, malformed, .5f);
            Assert.IsFalse(smoothed.TryGet(ExpressionSignal.MouthOpen, out _));
            Assert.IsFalse(smoothed.TryGet(ExpressionSignal.GazeLeftX, out _));
        }

        [Test]
        public void ModelFrameJoinsOnlyMatchingFreshPoseWithBoundedSkewAndConfidence()
        {
            var id = new FaceIdentity(1, 2);
            var frame = new OnDeviceBlendshapeFrame { Identity = id, Timestamp = 10, Confidence = .9f };
            Assert.IsTrue(BlendshapeFramePolicy.CanJoin(id, 10.02, frame, 10.03, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(new FaceIdentity(2, 3), 10.02, frame, 10.03, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(default, 10.02, frame, 10.03, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10.05, frame, 10.06, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10.02, frame, 10.3, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10.02, frame, 9.9, .2, .04, .4f));
            frame.Confidence = .2f;
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10.02, frame, 10.03, .2, .04, .4f));
        }

        [Test]
        public void ModelFrameJoinRejectsInvalidNumericInputs()
        {
            var id = new FaceIdentity(1, 2);
            var frame = new OnDeviceBlendshapeFrame { Identity = id, Timestamp = 10, Confidence = .9f };
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, double.NaN, frame, 10.03, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, double.PositiveInfinity, .2, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, 10.03, double.NaN, .04, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, 10.03, .2, -1, .4f));
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, 10.03, .2, .04, float.NaN));
            frame.Timestamp = double.NaN;
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, 10.03, .2, .04, .4f));
            frame.Timestamp = 10; frame.Confidence = float.NaN;
            Assert.IsFalse(BlendshapeFramePolicy.CanJoin(id, 10, frame, 10.03, .2, .04, .4f));
        }
    }
}
