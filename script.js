var percent=document.querySelector(".percent")
var btn=document.querySelector("button")
var progress=document.querySelector("#progress")
var growth=document.querySelector("#growth")

var grow=0
btn.addEventListener('click',function(){
 var int= setInterval(function(){
    grow++
    percent.innerHTML=grow+"%"
    growth.style.width=grow+"%"
    btn.style.opacity=0.8
  },100)

setInterval(function(){
clearInterval(int)
btn.innerHTML="downloaded"
btn.style.opacity=0.5

},10000)
  
})