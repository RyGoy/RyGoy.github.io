var content = document.getElementById('content');
var helpContent = document.getElementById('helpContent');
var bContent = document.getElementById('bContent')
var mobiMenu = document.getElementById('mobimenu')

var contentHidden = true;
var helpHidden = true;
var bHidden = true;
var mobiHidden = true;


function hideShow() {
    if(contentHidden == true) {
        content.classList.remove('hidden');
        contentHidden = false; 
    }
    else {
        content.classList.add('hidden');
        contentHidden = true;
    };
};

function hideShowA() {
    if (helpHidden == true) {
        helpContent.classList.remove('hidden');
        helpHidden = false;
    }
    else { 
        helpContent.classList.add('hidden')
        helpHidden = true;
    }
}

function hideShowB() {
    if (bHidden == true) {
        bContent.classList.remove('hidden');
        bHidden = false;
    }
    else { 
        bContent.classList.add('hidden')
        bHidden = true;
    }
}

function mobiHide() {
    if (mobiHidden == true) {
        mobiMenu.classList.remove('hidden')
        mobiHidden = false;
    }
    else {
        mobiMenu.classList.add('hidden')
        mobiHidden = true;
    }
}


