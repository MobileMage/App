import {format} from 'date-fns';
import React, {useState} from 'react';
import {View} from 'react-native';
import Button from '@components/Button';
import DatePicker from '@components/DatePicker';
import InteractiveStepWrapper from '@components/InteractiveStepWrapper';
import ScrollView from '@components/ScrollView';
import Text from '@components/Text';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeStyles from '@hooks/useThemeStyles';
import {isRequiredFulfilled} from '@libs/ValidationUtils';
import Navigation from '@navigation/Navigation';
import {setAssignCardStepAndData} from '@userActions/CompanyCards';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

function AssignmentDateStep() {
    const {translate} = useLocalize();
    const styles = useThemeStyles();

    const [assignCard] = useOnyx(ONYXKEYS.ASSIGN_CARD);
    const isEditing = assignCard?.isEditing;
    const cardToAssign = assignCard?.cardToAssign;

    const [errorText, setErrorText] = useState('');
    const [localAssignmentDate, setLocalAssignmentDate] = useState<string>();
    const assignmentDate = localAssignmentDate ?? cardToAssign?.assignmentDate ?? format(new Date(), CONST.DATE.FNS_FORMAT_STRING);

    const handleBackButtonPress = () => {
        if (isEditing) {
            setAssignCardStepAndData({isEditing: false});
        }
        Navigation.goBack();
    };

    const submit = () => {
        if (!isRequiredFulfilled(assignmentDate)) {
            setErrorText(translate('common.error.fieldRequired'));
            return;
        }

        setAssignCardStepAndData({
            cardToAssign: {assignmentDate},
            isEditing: false,
        });

        Navigation.goBack();
    };

    return (
        <InteractiveStepWrapper
            wrapperID="AssignmentDateStep"
            handleBackButtonPress={handleBackButtonPress}
            headerTitle={translate('workspace.companyCards.assignCard')}
            enableEdgeToEdgeBottomSafeAreaPadding
        >
            <ScrollView
                style={styles.pt0}
                contentContainerStyle={styles.flexGrow1}
                addBottomSafeAreaPadding
            >
                <Text style={[styles.textSupporting, styles.ph5, styles.mv3]}>{translate('workspace.companyCards.assignmentDateDescription')}</Text>
                <View style={styles.ph5}>
                    <DatePicker
                        inputID=""
                        value={assignmentDate}
                        label={translate('workspace.companyCards.assignmentDate')}
                        onInputChange={(value) => {
                            if (!isRequiredFulfilled(value)) {
                                setErrorText(translate('common.error.fieldRequired'));
                            } else {
                                setErrorText('');
                            }
                            setLocalAssignmentDate(value);
                        }}
                        minDate={new Date()}
                        errorText={errorText}
                    />
                </View>
                <View style={[styles.mh5, styles.pb5, styles.mt3, styles.flexGrow1, styles.justifyContentEnd]}>
                    <Button
                        success
                        large
                        pressOnEnter
                        text={translate('common.save')}
                        onPress={submit}
                        style={styles.w100}
                    />
                </View>
            </ScrollView>
        </InteractiveStepWrapper>
    );
}

export default AssignmentDateStep;
