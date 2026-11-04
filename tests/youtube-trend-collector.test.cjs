// Run: node --test tests/youtube-trend-collector.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectYouTubePopular,tokens}=require('../tools/youtube-trend-collector.cjs');
const NOW=Date.UTC(2026,10,4,10);
test('requires operator grant and a server-side credential',async()=>{
  await assert.rejects(collectYouTubePopular({apiKey:'abc',approved:false,fetchImpl:()=>{throw Error('never')}}),/Operator approval/);
  await assert.rejects(collectYouTubePopular({approved:true,fetchImpl:()=>{throw Error('never')}}),/credential/);
});
test('collects permitted public YouTube metadata, not media',async()=>{
  let captured='';
  const fake=async(url,options)=>{
    captured=url;
    assert.equal(options.method,'GET');
    return {ok:true,status:200,json:async()=>({items:[{
      id:'video_12345',snippet:{title:'#fruitcut cool trend',description:'',
        publishedAt:new Date(NOW-3600000).toISOString(),tags:['fruitcut']},
      statistics:{viewCount:'1000',likeCount:'20',commentCount:'5'}
    }]})};
  };
  const signals=await collectYouTubePopular({apiKey:'SENSITIVE_EXAMPLE',approved:true,regionCode:'IN',now:NOW,fetchImpl:fake});
  assert.equal(signals.length,1);
  assert.equal(signals[0].source,'youtube');
  assert.deepEqual(signals[0].tags,['fruitcut']);
  assert.equal(signals[0].metrics.shares,undefined);
  assert.equal(signals[0].metrics.views,1000);
  const url=new URL(captured);
  assert.equal(url.searchParams.get('chart'),'mostPopular');
  assert.equal(url.searchParams.get('regionCode'),'IN');
});
test('invalid metadata, old videos and unsafe tags are excluded',async()=>{
  const fake=async()=>({ok:true,json:async()=>({items:[{
    id:'video_12345',snippet:{publishedAt:new Date(NOW-20*86400000).toISOString(),tags:['neon']},
    statistics:{viewCount:'1000'}
  },{
    id:'video_12346',snippet:{publishedAt:new Date(NOW-3600000).toISOString(),tags:['terror']},
    statistics:{viewCount:'900'}
  }]})});
  const r=await collectYouTubePopular({approved:true,apiKey:'abc',now:NOW,fetchImpl:fake});
  assert.equal(r.length,0);
});
test('network errors exclude API key and response body',async()=>{
  await assert.rejects(collectYouTubePopular({approved:true,apiKey:'SECRET_VALUE',fetchImpl:async()=>({ok:false,status:403})}),e=>
    !String(e).includes('SECRET_VALUE') && /403/.test(String(e)));
});
test('tag extraction uses supplied tag words and hashtags only',()=>{
  assert.deepEqual(tokens({snippet:{title:'Looking cool #galaxy',tags:['neon'],description:'hello #star'}}),
    ['neon','galaxy','star']);
});
